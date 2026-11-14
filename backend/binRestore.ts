// Session 27. Taking an account out of the bin (normal delete is restorable — rule 56).
// The normal delete sets is_deleted on users + creator/brand profiles and lists the id/email in
// db.deleted_user_ids / deleted_user_emails; a restore has to undo ALL of it, or the account stays
// hidden (before, restore/reinstate only touched users.is_deleted).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function restoreFromBin(targetId: string, { db, client }: { db: any; client: any }) {
  const id = String(targetId);
  const emails = new Set<string>();
  for (const key of ["users", "creator_profiles", "brand_profiles", "waitlist"]) {
    for (const row of db[key] || []) {
      if (row && (row.user_id === id || String(row.id) === id)) {
        row.is_deleted = false;
        if (key === "users") row.banned = false;
        if (row.email) emails.add(String(row.email).toLowerCase());
      }
    }
  }
  if (client) {
    try {
      const { data } = await client.from("users").select("email").eq("user_id", id).limit(1);
      if (data?.[0]?.email) emails.add(String(data[0].email).toLowerCase());
    } catch { /* read only */ }
    const writes = [
      client.from("users").update({ is_deleted: false, banned: false }).eq("user_id", id),
      client.from("creator_profiles").update({ is_deleted: false }).eq("user_id", id),
      client.from("brand_profiles").update({ is_deleted: false }).eq("user_id", id),
    ];
    if (UUID_RE.test(id)) writes.push(client.from("creator_profiles").update({ is_deleted: false }).eq("id", id));
    await Promise.all(writes.map((w: any) => Promise.resolve(w).catch(() => null)));
  }
  if (Array.isArray(db.deleted_user_ids)) db.deleted_user_ids = db.deleted_user_ids.filter((x: any) => String(x) !== id);
  if (Array.isArray(db.deleted_user_emails)) db.deleted_user_emails = db.deleted_user_emails.filter((e: any) => !emails.has(String(e).toLowerCase()));
}
