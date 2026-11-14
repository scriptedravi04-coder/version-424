import express from "express";

// Session 28: admin view of the permanent signature records (backend/agreementRecord.ts).
// WHO: admin staff only (role admin, or an admin-account sub-admin). Read-only — nothing here
// can change a record (the table blocks edits anyway).
export function setupAdminAgreementRoutes(
  router: express.Router,
  { supabase, privilegedSupabase, getDb, parseAuthUser }: { supabase: any; privilegedSupabase: any; getDb: () => any; parseAuthUser: (req: any) => Promise<any> }
) {
  router.get("/admin/agreements", async (req: any, res: any) => {
    const admin = await parseAuthUser(req);
    const isStaff = admin && (admin.role === "admin" || admin.team_role === "sub_admin");
    if (!isStaff) return res.status(403).json({ error: "Admin only" });

    const ids = ["thread_id", "order_id", "deal_id"]
      .map((k) => [k, String(req.query?.[k] || "").trim()] as const)
      .filter(([, v]) => v);
    if (!ids.length) return res.status(400).json({ error: "Pass thread_id, order_id or deal_id" });

    const client = privilegedSupabase || supabase;
    if (!client) {
      const rows = (getDb()?.agreement_signatures || []).filter((r: any) => ids.some(([k, v]) => String(r[k] || "") === v));
      return res.json({ records: rows });
    }
    try {
      const orExpr = ids.map(([k, v]) => `${k}.eq.${v.replace(/[,()]/g, "")}`).join(",");
      const { data, error } = await client.from("agreement_signatures").select("*").or(orExpr).order("signed_at", { ascending: true });
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ records: data || [] });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Could not load agreement records" });
    }
  });
}
