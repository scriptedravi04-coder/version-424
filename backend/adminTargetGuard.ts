// Session 43 (v288, Ravi: "jaise users ke liye delete / complete wipe out hai, admin ke liye bhi do").
// Who may delete (bin) or wipe an ADMIN / SUB-ADMIN account — ARCHITECTURE rule 56 (updated):
//   • only a full admin (role "admin", not a sub-admin) may touch another admin account;
//   • never yourself;
//   • never the last full admin (someone must always be able to log in to the admin panel).
// Normal users are unchanged (any admin / sub-admin may bin them; only a full admin may wipe).

export const isAdminAccount = (u: any) =>
  Boolean(u && (u.role === "admin" || u.role === "sub_admin" || u.team_role === "sub_admin" || u.is_admin === true));
export const isFullAdmin = (u: any) =>
  Boolean(u && (u.role === "admin" || u.is_admin === true) && u.team_role !== "sub_admin" && u.role !== "sub_admin");

/** Returns null when allowed, else { status, code, error }. `fullAdminCount` = full admins that exist now. */
export function adminTargetBlock(actor: any, target: any, fullAdminCount: number): { status: number; code: string; error: string } | null {
  if (!target) return null;
  if (String(target.user_id || "") && String(target.user_id) === String(actor?.user_id || "")) {
    return { status: 400, code: "SELF", error: "You cannot delete or wipe your own account." };
  }
  if (!isAdminAccount(target)) return null;
  if (!isFullAdmin(actor)) return { status: 403, code: "ONLY_FULL_ADMIN", error: "Only a full admin can delete or wipe an admin account." };
  if (isFullAdmin(target) && fullAdminCount <= 1) {
    return { status: 409, code: "LAST_ADMIN", error: "This is the last full admin. Make someone else a full admin first." };
  }
  return null;
}

/** Counts full admins (Supabase when there is a client, else the local db). Never deleted / banned ones. */
export async function countFullAdmins(client: any, db: any): Promise<number> {
  const rows: any[] = [];
  // Session 58 (Ravi: "kisi bhi admin ko delete nahi kar raha"): the live users table has no `is_admin`
  // column, so the old query failed every time, the count fell back to the local copy (0 or 1 admin) and
  // EVERY admin delete / wipe said "last full admin". Now: ask for the columns that exist, simplest last.
  let readFromServer = false;
  if (client) {
    const tries: Array<[string, (q: any) => any]> = [
      ["user_id,role,team_role,is_admin,is_deleted,banned", (q) => q.or("role.eq.admin,is_admin.eq.true")],
      ["user_id,role,team_role,is_deleted,banned", (q) => q.eq("role", "admin")],
      ["user_id,role,team_role", (q) => q.eq("role", "admin")],
      ["user_id,role", (q) => q.eq("role", "admin")],
    ];
    for (const [cols, where] of tries) {
      try {
        const { data, error } = await where(client.from("users").select(cols));
        if (error) continue;
        rows.push(...(data || []));
        readFromServer = true;
        break;
      } catch { /* try the next, smaller column list */ }
    }
  }
  if (!readFromServer && !rows.length) rows.push(...((db?.users || []) as any[]).filter((u) => u.role === "admin" || u.is_admin === true));
  return rows.filter((u) => isFullAdmin(u) && !u.is_deleted && !u.banned).length;
}

/** Session 58: one call for "may this staff member act on this account?" — never themselves, and only a full admin
 *  acts on an admin account. Used by restore / unban / unrestrict / reinstate / warnings / creator edits too. */
export async function staffTargetBlock(actor: any, targetId: string, client: any, db: any, verb = "change") {
  let target: any = null;
  try {
    if (client) {
      const { data } = await client.from("users").select("user_id,role,team_role").eq("user_id", String(targetId)).maybeSingle();
      target = data || null;
    }
  } catch { target = null; }
  if (!target) target = (db?.users || []).find((u: any) => String(u.user_id) === String(targetId)) || null;
  const block = adminTargetBlock(actor, target, await countFullAdmins(client, db));
  return block ? { ...block, error: block.error.replace("delete or wipe", verb) } : null;
}
