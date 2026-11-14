// Session 34 (Ravi + legal draft Part E): record WHAT a user agreed to, WHICH version and WHEN —
// a tick box proves nothing later without this. Table public.user_consents
// (scripts/sql/OLD_SQL_already_run.sql (user_consents part)), one row per decision; the latest row per kind wins.
// Saving a consent never blocks signup or onboarding: a failed write is logged (and kept in the
// server's local store) instead.
import express from "express";

export const CONSENT_KINDS = ["terms", "privacy", "marketing", "creator_terms", "brand_terms"] as const;
export const TERMS_VERSION = "1.4"; // session 58 v332 (Ravi "hn krvana h"): fee renamed "Convenience fee & TDS". 1.3 = session 43 v290: referral & invite rewards section. 1.2 = v283: offers & promotions on by default (opt-out). 1.1 = session 36. Keep in step with src/lib/legal/legalContent.js LEGAL.termsVersion

let missingLogged = false;

export async function recordConsents(
  deps: { getClient: () => any; getDb: () => any; saveDb: (db: any) => void },
  userId: string,
  items: Array<{ kind: string; granted: boolean; version?: string; source?: string }>,
  meta: { ip?: string; ua?: string } = {},
) {
  const rows = items
    .filter((i) => (CONSENT_KINDS as readonly string[]).includes(i.kind))
    .map((i) => ({
      user_id: String(userId),
      kind: i.kind,
      granted: Boolean(i.granted),
      version: i.version || TERMS_VERSION,
      source: String(i.source || "app").slice(0, 40),
      ip: String(meta.ip || "").slice(0, 64),
      user_agent: String(meta.ua || "").slice(0, 300),
      created_at: new Date().toISOString(),
    }));
  if (!rows.length) return { ok: true, saved: 0 };
  const client = deps.getClient();
  let stored = false;
  if (client) {
    try {
      const { error } = await client.from("user_consents").insert(rows);
      if (!error) stored = true;
      else if (/relation .* does not exist|could not find the table|PGRST205|42P01/i.test(`${error.message}${error.code}`)) {
        if (!missingLogged) { missingLogged = true; console.warn("[consents] table user_consents missing — run scripts/sql/OLD_SQL_already_run.sql (user_consents part)"); }
      } else console.warn("[consents] save failed:", error.message || error);
    } catch (e: any) { console.warn("[consents] save failed:", e?.message || e); }
  }
  try {
    const db = deps.getDb();
    if (!db.user_consents) db.user_consents = [];
    db.user_consents.push(...rows);
    deps.saveDb(db);
  } catch { /* local cache only */ }
  return { ok: true, saved: rows.length, stored: stored ? "server" : "server_local" };
}

/** Latest decision per kind for one user. */
/** v397: an account made in the last 7 days counts as "just signed up" (agreed on the sign-up screen). Pure. */
export function isNewSignup(createdAt: any, now = Date.now()): boolean {
  const t = Date.parse(String(createdAt || ""));
  return Number.isFinite(t) && now - t >= -60000 && now - t < 7 * 24 * 3600 * 1000;
}
async function signupTime(deps: { getClient: () => any; getDb: () => any }, user: any): Promise<any> {
  if (user?.created_at) return user.created_at;
  const c = deps.getClient();
  if (c) { try { const { data } = await c.from("users").select("created_at").eq("user_id", user.user_id).maybeSingle(); if (data?.created_at) return data.created_at; } catch { /* ignore */ } }
  const local = (deps.getDb?.()?.users || []).find((u: any) => String(u.user_id) === String(user.user_id));
  return local?.created_at || null;
}

export async function latestConsents(deps: { getClient: () => any; getDb: () => any }, userId: string) {
  let rows: any[] = [];
  const client = deps.getClient();
  if (client) {
    try {
      const { data, error } = await client.from("user_consents").select("kind, granted, version, created_at").eq("user_id", String(userId)).order("created_at", { ascending: false }).limit(50);
      if (!error && Array.isArray(data)) rows = data;
    } catch { /* fall back to local */ }
  }
  if (!rows.length) rows = (deps.getDb().user_consents || []).filter((r: any) => r.user_id === String(userId)).slice().reverse();
  const out: Record<string, any> = {};
  for (const r of rows) if (!out[r.kind]) out[r.kind] = { granted: r.granted, version: r.version, at: r.created_at };
  return out;
}

export function setupConsentRoutes(router: express.Router, deps: {
  parseAuthUser: (req: any) => Promise<any>; getClient: () => any; getDb: () => any; saveDb: (db: any) => void;
}) {
  router.get("/consents/me", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!user) return res.status(401).json({ detail: "Not authenticated" });
    let consents: any = await latestConsents(deps, user.user_id);
    // v397 (Ravi, 3 Nov: "sign up pe hi likha hai 'by continuing you accept the Terms' — onboarding mein dobara popup kyun?"):
    // a NEW account (made in the last 7 days) with no Terms record at all agreed on the sign-up screen — that is
    // saved now (current version, source "signup_screen") so the popup doesn't ask again. The popup still appears for
    // people who accepted an OLDER version when the Terms change.
    try {
      if (!consents?.terms && isNewSignup(await signupTime(deps, user))) {
        const role = String(user.role || "").toLowerCase();
        await recordConsents(deps, user.user_id, [
          { kind: "terms", granted: true, source: "signup_screen" },
          { kind: "privacy", granted: true, source: "signup_screen" },
          ...(role === "brand" || role === "creator" ? [{ kind: role === "brand" ? "brand_terms" : "creator_terms", granted: true, source: "signup_screen" }] : []),
        ], { ip: String(req.headers?.["x-forwarded-for"] || req.ip || "").split(",")[0].trim(), ua: String(req.headers?.["user-agent"] || "") });
        consents = await latestConsents(deps, user.user_id);
      }
    } catch (e: any) { console.warn("[consents] signup record notice", e?.message || e); }
    return res.json({ consents, terms_version: TERMS_VERSION });
  });

  // Body: { items: [{ kind, granted }], source }
  router.post("/consents", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!user) return res.status(401).json({ detail: "Not authenticated" });
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 5) : [];
    const valid = items.filter((i: any) => (CONSENT_KINDS as readonly string[]).includes(i?.kind) && typeof i?.granted === "boolean");
    if (!valid.length) return res.status(400).json({ detail: "Nothing to save.", code: "BAD_CONSENT" });
    const r = await recordConsents(deps, user.user_id, valid.map((i: any) => ({ kind: i.kind, granted: i.granted, source: req.body?.source })), {
      ip: String(req.headers?.["x-forwarded-for"] || req.ip || "").split(",")[0].trim(),
      ua: String(req.headers?.["user-agent"] || ""),
    });
    // Session 58: "Offers and promotions" off must actually stop promo emails — broadcasts skip only the
    // email_unsubscribes list, which this switch never touched. On again → removed from that list.
    const mk = valid.find((i: any) => i.kind === "marketing");
    const email = String(user.email || "").trim().toLowerCase();
    const client = deps.getClient();
    if (mk && email && client) {
      try {
        if (mk.granted) await client.from("email_unsubscribes").delete().eq("email", email);
        else await client.from("email_unsubscribes").upsert([{ email, created_at: new Date().toISOString() }], { onConflict: "email" });
      } catch (e: any) { console.warn("[consents] unsubscribe sync notice", e?.message || e); }
    }
    return res.json({ ...r, consents: await latestConsents(deps, user.user_id) });
  });
}
