// Session 34 (Ravi): onboarding is saved on the SERVER after every step (answers + where the
// person is), so they continue exactly where they left — on any device. Before, the creator
// flow kept its place only in this browser's storage and the brand flow saved nothing until
// "Publish".
//
// Table: public.onboarding_progress (SQL: scripts/sql/OLD_SQL_already_run.sql (onboarding_progress part)), service-role only.
// Without the table it falls back to the server's local store (getDb) and says so once in the log
// — that copy is per instance, so run the SQL in production.
//
// WHO: the logged-in user, own row only (user_id comes from the session, never from the body).
// Nothing here touches roles, money or another user's data. The only write outside the progress
// row: a phone number for an account that has none yet (Google sign-up), validated, never
// overwriting an existing number.
import express from "express";

const TABLE = "onboarding_progress";
const MAX_ANSWERS_BYTES = 64 * 1024;
const FLOWS = new Set(["creator_desktop", "creator_mobile", "brand_desktop", "brand_mobile"]);
const PAGE_RE = /^[a-z_]{1,32}$/;

let tableMissingLogged = false;
const isMissingTable = (error: any) =>
  /relation .* does not exist|could not find the table|PGRST205|42P01/i.test(String(error?.message || "") + String(error?.code || ""));

/** "+91 98765 43210" / "9876543210" / "+44 7700 900123" → "+919876543210" etc., or null. */
export function normalisePhone(raw: any): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  let digits = s.replace(/\D/g, "");
  const hasPlus = s.startsWith("+");
  if (!hasPlus || s.startsWith("+91")) {
    if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
    else if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
    if (digits.length === 10) return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
    if (!hasPlus) return null;
  }
  return digits.length >= 6 && digits.length <= 15 ? `+${digits}` : null;
}

/** Strip anything we do not want to keep: data: URLs (big inline images) and oversized blobs. */
export function cleanAnswers(answers: any): any {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return {};
  const out: any = {};
  for (const [k, v] of Object.entries(answers)) {
    if (typeof v === "string" && v.startsWith("data:")) continue;
    out[k] = v;
  }
  return out;
}

export function setupOnboardingProgressRoutes(router: express.Router, deps: {
  parseAuthUser: (req: any) => Promise<any>;
  getClient: () => any;
  getDb: () => any;
  saveDb: (db: any) => void;
}) {
  const local = (userId: string) => {
    const db = deps.getDb();
    if (!db.onboarding_progress) db.onboarding_progress = [];
    return { db, row: (db.onboarding_progress as any[]).find((r: any) => r.user_id === userId) || null };
  };
  const warnOnce = () => {
    if (tableMissingLogged) return;
    tableMissingLogged = true;
    console.warn(`[onboarding] table '${TABLE}' missing — progress is kept in this server's local store only. Run scripts/sql/OLD_SQL_already_run.sql (onboarding_progress part).`);
  };

  router.get("/onboarding/progress", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!user) return res.status(401).json({ detail: "Not authenticated" });
    const uid = String(user.user_id);
    const client = deps.getClient();
    if (client) {
      try {
        const { data, error } = await client.from(TABLE).select("*").eq("user_id", uid).maybeSingle();
        if (!error) return res.json({ progress: data || local(uid).row || null });
        if (isMissingTable(error)) warnOnce();
        else console.warn("[onboarding] read failed:", error.message || error);
      } catch (e: any) { console.warn("[onboarding] read failed:", e?.message || e); }
    }
    return res.json({ progress: local(uid).row || null });
  });

  router.post("/onboarding/progress", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!user) return res.status(401).json({ detail: "Not authenticated" });
    const uid = String(user.user_id);
    const role = user.role === "brand" ? "brand" : user.role === "creator" ? "creator" : null;
    if (!role) return res.status(400).json({ detail: "Choose creator or brand first.", code: "NO_ROLE" });

    const body = req.body || {};
    const flow = String(body.flow || "");
    const page = String(body.page || "");
    if (!FLOWS.has(flow) || !flow.startsWith(role)) return res.status(400).json({ detail: "Unknown onboarding flow.", code: "BAD_FLOW" });
    if (!PAGE_RE.test(page)) return res.status(400).json({ detail: "Unknown onboarding step.", code: "BAD_PAGE" });
    const answers = cleanAnswers(body.answers);
    if (Buffer.byteLength(JSON.stringify(answers), "utf8") > MAX_ANSWERS_BYTES) {
      return res.status(413).json({ detail: "Too much data in one save.", code: "TOO_LARGE" });
    }
    const pos = body.pos && typeof body.pos === "object" && !Array.isArray(body.pos)
      ? { step: Number(body.pos.step) || 0, sub: Number(body.pos.sub) || 0 } : null;

    const client = deps.getClient();

    // Phone for an account that has none (Google sign-up). Never overwrites an existing number.
    let phoneSaved: string | null = null;
    if (body.phone !== undefined && body.phone !== null && String(body.phone).trim()) {
      const phone = normalisePhone(body.phone);
      if (!phone) return res.status(400).json({ detail: "Please enter a valid mobile number.", code: "BAD_PHONE" });
      if (!String(user.phone || "").replace(/\D/g, "")) {
        if (client) {
          const { error } = await client.from("users").update({ phone }).eq("user_id", uid).or("phone.is.null,phone.eq.");
          if (error) {
            console.warn("[onboarding] phone save failed:", error.message || error);
            // Session 43: say it plainly when the number already belongs to another account.
            const taken = /duplicate|unique|23505/i.test(String(error.message || error.code || ""));
            return res.status(taken ? 409 : 500).json({
              detail: taken ? "This mobile number is already used by another Ybex account. Please use a different number." : `Could not save your mobile number: ${error.message || "database error"}`,
              code: "PHONE_SAVE_FAILED",
            });
          }
        }
        const { db } = local(uid);
        const lu = (db.users || []).find((u: any) => u.user_id === uid);
        if (lu && !lu.phone) lu.phone = phone;
        phoneSaved = phone;
      }
    }

    const prev = local(uid).row;
    const row = {
      user_id: uid,
      role,
      flow,
      page,
      pos,
      answers,
      basics_done: Boolean(body.basics_done) || Boolean(prev?.basics_done),
      updated_at: new Date().toISOString(),
    };

    let stored: "server" | "server_local" = "server_local";
    if (client) {
      try {
        const { error } = await client.from(TABLE).upsert(row, { onConflict: "user_id" });
        if (!error) stored = "server";
        else if (isMissingTable(error)) warnOnce();
        else {
          console.warn("[onboarding] save failed:", error.message || error);
          return res.status(500).json({ detail: `Could not save your progress: ${error.message || "database error"}`, code: "PROGRESS_SAVE_FAILED" });
        }
      } catch (e: any) { console.warn("[onboarding] save failed:", e?.message || e); }
    }
    // Local copy too (fallback, and so this instance answers GET even before Supabase replicates).
    const { db } = local(uid);
    db.onboarding_progress = (db.onboarding_progress as any[]).filter((r: any) => r.user_id !== uid).concat([row]);
    try { deps.saveDb(db); } catch { /* local cache only */ }

    return res.json({ success: true, stored, basics_done: row.basics_done, updated_at: row.updated_at, phone: phoneSaved });
  });
}
