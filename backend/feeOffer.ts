// Session 36 (Ravi): Admin → Fee settings → "Offer: ₹0 platform fee + convenience fee".
// Turning it on or off needs the admin's own password (checked on the server), 5 wrong tries → 15 min
// block, and every change is logged. It affects only deals the brand PAYS while it is on; the fee is then
// stamped on the transaction (stampedFee.ts), so switching it off never changes those deals.
import express from "express";
import { passwordMatches } from "./admin_wipe_routes";

const fails = new Map<string, number[]>();
const WINDOW = 15 * 60 * 1000;

type Deps = {
  supabase: any; privilegedSupabase: any; getDb: () => any; saveDb: (db: any) => void;
  parseAuthUser: (req: express.Request) => Promise<any>;
  logAdminAction: (user: any, action: any, targetType: any, targetId: any, detail: any) => Promise<any>;
};

export function setupFeeOfferRoutes(router: express.Router, deps: Deps) {
  const client = () => deps.privilegedSupabase || deps.supabase;

  router.post("/admin/fee-offer", async (req, res) => {
    const admin = await deps.parseAuthUser(req);
    if (!admin || admin.role !== "admin" || admin.team_role === "sub_admin") {
      return res.status(403).json({ error: "Only a full admin can change the fee offer." });
    }
    const id = String(admin.user_id);
    const recent = (fails.get(id) || []).filter((t) => Date.now() - t < WINDOW);
    if (recent.length >= 5) return res.status(429).json({ error: "Too many wrong passwords. Try again in 15 minutes." });

    const on = req.body?.on === true;
    const pct = Number(req.body?.pct);
    const label = String(req.body?.label || "Festive offer").trim().slice(0, 40) || "Festive offer";
    // Session 36: the promotional line users see while the offer is on (e.g. "🪔 Diwali offer — till 31 Oct").
    // The fee % is added by the app from the real setting, so the line can never show a wrong number.
    const promoLine = String(req.body?.promo_line ?? "").replace(/\d+(\.\d+)?\s*%/g, "").trim().slice(0, 90);
    const lineUntil = req.body?.line_until ? new Date(String(req.body.line_until)) : null;
    if (lineUntil && isNaN(lineUntil.getTime())) return res.status(400).json({ error: "The end date is not valid." });
    if (on && (!Number.isFinite(pct) || pct < 0 || pct > 15)) return res.status(400).json({ error: "Convenience fee must be between 0% and 15%." });
    const password = String(req.body?.password || "");
    if (!password) return res.status(400).json({ error: "Enter your admin password to confirm.", code: "PASSWORD_REQUIRED" });

    let row: any = null;
    if (client()) {
      const { data } = await client().from("users").select("user_id, password_hash").eq("user_id", id).maybeSingle();
      row = data;
    }
    if (!row) row = (deps.getDb().users || []).find((u: any) => u.user_id === id);
    if (!row?.password_hash) {
      return res.status(400).json({ error: "Your admin account has no password (Google sign-in). Set one with 'Forgot password' on the login page, then use it here.", code: "NO_PASSWORD" });
    }
    if (!(await passwordMatches(password, row))) {
      fails.set(id, [...recent, Date.now()]);
      return res.status(401).json({ error: "Wrong password.", tries_left: Math.max(0, 4 - recent.length) });
    }
    fails.delete(id);

    const nowIso = new Date().toISOString();
    const patch: any = { offer_mode: on, offer_label: label, offer_promo_line: promoLine || null, offer_line_until: lineUntil ? lineUntil.toISOString() : null, updated_at: nowIso };
    if (on) patch.offer_fee_pct = pct;
    const db = deps.getDb();
    db.platform_fee_config = { ...(db.platform_fee_config || {}), ...patch };
    deps.saveDb(db);
    if (client()) {
      const { data: latest } = await client().from("platform_fee_config").select("id").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      const q = latest?.id != null
        ? client().from("platform_fee_config").update(patch).eq("id", latest.id)
        : client().from("platform_fee_config").insert([{ id: 1, ...patch }]);
      const { error } = await q;
      if (error) return res.status(502).json({ error: "Could not save (run the session 36 SQL for the offer columns): " + error.message });
    }
    await deps.logAdminAction(admin, on ? "fee_offer_on" : "fee_offer_off", "platform_fee_config", "offer", { pct: on ? pct : null, label });
    return res.json({ ok: true, offer_mode: on, offer_fee_pct: on ? pct : undefined, offer_label: label });
  });
}
