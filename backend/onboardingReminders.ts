// Session 36 (Ravi): onboarding reminder emails. Someone who signed up but did not finish onboarding
// gets at most TWO emails — 1 day and 3 days after they last saved a step — then never again.
// Every email has a "Stop these reminders" link. Runs from Cloud Scheduler:
//   POST /api/internal/cron/onboarding-reminders   (header x-cron-secret = CRON_SECRET)
// State lives in public.onboarding_reminders (session 36 SQL); without the table it falls back to the
// local cache, so nothing is sent twice from one server.
import express from "express";
import { Resend, buildEmailHtml, getValidFromEmail } from "./helpers";
import { signEmailLink, verifyEmailLink, appBaseUrl, simplePage, cronAuthorized } from "./emailLinks";

export const REMINDER_DELAYS_HOURS = [24, 72];
const MAX_PER_RUN = 80; // stays under Resend's free 100/day with room for OTP and deal emails

type ReminderState = { user_id: string; sent_count: number; last_sent_at: string | null; stopped_at: string | null };

const isRealEmail = (em: string) => {
  const e = String(em || "").trim().toLowerCase();
  return e.includes("@") && e.includes(".") && !e.endsWith("@ybex.io") && !e.includes("@example.com") && !e.endsWith(".demo");
};

/** Pure: who gets which reminder now. lastActivity = onboarding_progress.updated_at, else users.created_at. */
export function pickReminders(
  users: any[],
  progressByUser: Map<string, any>,
  stateByUser: Map<string, ReminderState>,
  now = Date.now()
): Array<{ user: any; step: 1 | 2 }> {
  const out: Array<{ user: any; step: 1 | 2 }> = [];
  for (const u of users || []) {
    if (!u || u.onboarded === true || u.banned === true || u.is_deleted === true) continue;
    if (!["creator", "brand"].includes(String(u.role || "").toLowerCase())) continue;
    if (u.auth_method === "unclaimed" || !isRealEmail(u.email)) continue;
    const st = stateByUser.get(u.user_id);
    if (st?.stopped_at) continue;
    const sent = Number(st?.sent_count || 0);
    if (sent >= REMINDER_DELAYS_HOURS.length) continue;
    const p = progressByUser.get(u.user_id);
    const last = Date.parse(p?.updated_at || "") || Date.parse(u.created_at || "") || 0;
    if (!last) continue;
    const hours = (now - last) / 3600000;
    if (hours < REMINDER_DELAYS_HOURS[sent]) continue;
    // the 2nd email also waits 48 h after the 1st, even if they were idle long before we started
    if (sent === 1 && st?.last_sent_at && now - Date.parse(st.last_sent_at) < 48 * 3600000) continue;
    out.push({ user: u, step: (sent + 1) as 1 | 2 });
  }
  return out;
}

export function reminderEmail(user: any, step: 1 | 2) {
  const isBrand = String(user.role).toLowerCase() === "brand";
  const first = String(user.name || "").trim().split(/\s+/)[0] || "there";
  const token = signEmailLink("onb-stop", user.user_id);
  const stopUrl = token ? `${appBaseUrl()}/api/public/reminders/stop?u=${encodeURIComponent(user.user_id)}&t=${token}` : null;
  // v373: the point first (Ravi: subjects people must open). Brand subjects keep the word "brand".
  const named = first !== "there" ? `${first}, ` : "";
  const subject = step === 1
    ? (isBrand ? "Finish your brand setup" : "Finish your profile") // v419: short, action-first
    : (isBrand ? "Your brand setup is waiting" : "Brands can't find you yet");
  const paragraphs = isBrand
    ? [
        "You started setting up your brand on Ybex but did not finish. It takes a few minutes, and you can pick up exactly where you left off — on phone or laptop.",
        "Once done, you can explore creators, post a campaign or a UGC brief, and pay through a secure payment hold.",
      ]
    : [
        "You started your creator profile on Ybex but did not finish. Brands can only find and invite you once it is complete.",
        "Pick up exactly where you left off — it takes a few minutes, on phone or laptop.",
      ];
  const html = buildEmailHtml({
    eyebrow: isBrand ? "Finish setup" : "Finish your profile",
    preheader: isBrand ? "Finish setup and post your first brief today." : "Finish it in 3 minutes and you show up when brands search.",
    title: isBrand ? "Finish setting up your brand" : (step === 1 ? "Your profile is almost ready" : "Brands can't find you yet"),
    greeting: `Hi ${first},`,
    paragraphs,
    button: { text: isBrand ? "Finish brand setup" : "Finish my profile", link: `${appBaseUrl()}/onboarding` },
    footerHtml: stopUrl
      ? `You got this because you signed up on Ybex. <a href="${stopUrl}" style="color:#6b7280">Stop these reminders</a>`
      : "You got this because you signed up on Ybex.",
  });
  return { subject, html, stopUrl };
}

type Deps = {
  supabase: any;
  privilegedSupabase: any;
  getDb: () => any;
  saveDb: (db: any) => void;
};

async function loadState(client: any, db: any): Promise<{ map: Map<string, ReminderState>; table: boolean }> {
  const map = new Map<string, ReminderState>();
  let table = false;
  if (client) {
    const { data, error } = await client.from("onboarding_reminders").select("user_id, sent_count, last_sent_at, stopped_at");
    if (!error) { table = true; for (const r of data || []) map.set(r.user_id, r); }
  }
  for (const r of db.onboarding_reminders || []) if (!map.has(r.user_id)) map.set(r.user_id, r);
  return { map, table };
}

async function saveState(client: any, db: any, table: boolean, row: ReminderState) {
  if (!db.onboarding_reminders) db.onboarding_reminders = [];
  const i = db.onboarding_reminders.findIndex((r: any) => r.user_id === row.user_id);
  if (i >= 0) db.onboarding_reminders[i] = row; else db.onboarding_reminders.push(row);
  if (client && table) {
    const { error } = await client.from("onboarding_reminders").upsert([row], { onConflict: "user_id" });
    if (error) console.warn("[onboarding-reminders] state save:", error.message);
  }
}

export async function runOnboardingReminders({ supabase, privilegedSupabase, getDb, saveDb }: Deps, now = Date.now()) {
  const client = privilegedSupabase || supabase;
  const db = getDb();
  let users: any[] = [];
  const progress = new Map<string, any>();
  if (client) {
    const { data: u } = await client.from("users")
      .select("user_id, email, name, role, onboarded, banned, is_deleted, auth_method, created_at")
      .eq("onboarded", false);
    users = u || [];
    const { data: p } = await client.from("onboarding_progress").select("user_id, updated_at");
    for (const r of p || []) progress.set(r.user_id, r);
  } else {
    users = (db.users || []).filter((x: any) => x.onboarded !== true);
  }
  const { map, table } = await loadState(client, db);
  const due = pickReminders(users, progress, map, now).slice(0, MAX_PER_RUN);

  const key = process.env.RESEND_API_KEY;
  const result = { due: due.length, sent: 0, failed: 0, skipped_no_key: 0 };
  if (!key) { result.skipped_no_key = due.length; return result; }
  const resend = new Resend(key);
  for (const { user, step } of due) {
    const { subject, html, stopUrl } = reminderEmail(user, step);
    // v396 (QA E-6): never a reminder without a working "Stop these reminders" link (EMAIL_LINK_SECRET missing)
    if (!stopUrl) { (result as any).skipped_no_stop_link = ((result as any).skipped_no_stop_link || 0) + 1; continue; }
    try {
      const r: any = await resend.emails.send({ priority: "low", // v399 email budget: waits for the night window
        from: getValidFromEmail(process.env.RESEND_FROM_EMAIL),
        to: [user.email],
        subject,
        html,
        ...(stopUrl ? { headers: { "List-Unsubscribe": `<${stopUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
      });
      if (r?.error) { result.failed++; continue; }
      result.sent++;
      const prev = map.get(user.user_id);
      await saveState(client, db, table, {
        user_id: user.user_id,
        sent_count: step,
        last_sent_at: new Date(now).toISOString(),
        stopped_at: prev?.stopped_at || null,
      });
    } catch (e: any) {
      result.failed++;
      console.warn("[onboarding-reminders] send failed:", e?.message || e);
    }
  }
  saveDb(db);
  return result;
}

export function setupOnboardingReminderRoutes(router: express.Router, deps: Deps) {
  router.post("/internal/cron/onboarding-reminders", async (req, res) => {
    if (!cronAuthorized(req.headers["x-cron-secret"])) return res.status(401).json({ error: "Unauthorized" });
    try {
      return res.json({ ok: true, ...(await runOnboardingReminders(deps)) });
    } catch (e: any) {
      console.error("[onboarding-reminders] run error:", e?.message || e);
      return res.status(500).json({ error: "Reminder run failed" });
    }
  });

  const stop = async (req: express.Request, res: express.Response) => {
    const u = String(req.query.u || req.body?.u || "");
    const t = String(req.query.t || req.body?.t || "");
    if (!u || !verifyEmailLink("onb-stop", u, t)) {
      return res.status(400).type("html").send(simplePage("Link not valid", "This link is broken or too old. Write to support@ybexmedia.in and we will stop the reminders."));
    }
    const client = deps.privilegedSupabase || deps.supabase;
    const db = deps.getDb();
    const { map, table } = await loadState(client, db);
    const prev = map.get(u);
    await saveState(client, db, table, {
      user_id: u,
      sent_count: Math.max(Number(prev?.sent_count || 0), REMINDER_DELAYS_HOURS.length),
      last_sent_at: prev?.last_sent_at || null,
      stopped_at: new Date().toISOString(),
    });
    deps.saveDb(db);
    return res.type("html").send(simplePage("Reminders stopped", "You will not get any more onboarding reminders from Ybex. You can still finish your profile any time."));
  };
  router.get("/public/reminders/stop", stop);
  router.post("/public/reminders/stop", stop); // one-click unsubscribe from the mail app
}
