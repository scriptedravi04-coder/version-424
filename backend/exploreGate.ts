// Session 43 (Ravi): a creator who signs up and onboards shows on Explore only after an admin
// approves them from the waitlist (same gate as the creator form). Creators already on Explore
// before this change stay listed (Ravi: "wase hi rehne do") — the gate applies to profiles
// created from EXPLORE_GATE_FROM on. Rejected profiles never show.
export const EXPLORE_GATE_FROM = Date.parse("2026-10-10T00:00:00Z");

// v349 (Ravi): Admin → Users → creator → "Hide from Explore & Meet the Creators"
// (creator_profiles.hidden_from_explore). Hidden ≠ banned: the creator's own profile, deals, chats
// and direct /creator/:id link keep working — they only drop out of the lists brands / the public browse.
export function isHiddenFromExplore(row: any): boolean {
  const v = row?.hidden_from_explore;
  return v === true || v === 1 || String(v).toLowerCase() === "true";
}

// v357 (Ravi: "register karte hi Explore pe aa jaata hai, waitlist mein nahi jaata"): the database fills
// creator_profiles.profile_status with "approved" by DEFAULT, so a creator who only signed up (profile row made by
// an autosave / first profile load) looked approved without any admin review. From EXPLORE_GATE_FROM on, a
// self-registered (claimed) profile counts as approved ONLY when an admin reviewed it (reviewed_at is set by
// Admin → Waitlist approve and by Admin → creator edit). Unclaimed profiles from the creator form are made by the
// admin approval itself (reviewed_at set) and existing creators from before the gate stay as they are.
export function approvedByAdmin(row: any, gateFrom: number = EXPLORE_GATE_FROM): boolean {
  if (!row) return false;
  const status = String(row.profile_status || "").toLowerCase();
  if (status !== "approved") return false;
  if (row.reviewed_at) return true;
  if (row.is_claimed === false || String(row.creator_type || "").toLowerCase() === "unclaimed") return true;
  const created = Date.parse(row.created_at || row.inserted_at || "");
  if (!Number.isFinite(created) || created < gateFrom) return true; // existing creators stay listed
  return false; // "approved" only by the database default → still waiting for review
}

/** v357: a creator who still needs the admin's review — shown in Admin → Waitlist, never on Explore. */
export function awaitingReview(row: any, gateFrom: number = EXPLORE_GATE_FROM): boolean {
  if (!row || row.is_deleted) return false;
  const status = String(row.profile_status || "").toLowerCase();
  if (status === "rejected") return false;
  if (status === "approved") return !approvedByAdmin(row, gateFrom);
  if (status === "under_review" || status === "pending" || status === "draft") return true;
  return false;
}

export function visibleOnExplore(row: any, gateFrom: number = EXPLORE_GATE_FROM): boolean {
  if (!row) return false;
  if (isHiddenFromExplore(row)) return false; // v349: admin hid this creator from Explore
  const status = String(row.profile_status || "").toLowerCase();
  if (status === "rejected") return false;
  if (status === "approved") return approvedByAdmin(row, gateFrom); // v357: not the DB default
  const created = Date.parse(row.created_at || row.inserted_at || "");
  if (!Number.isFinite(created) || created < gateFrom) return true; // existing creators stay listed
  return false; // new and not approved yet → waitlist first
}

/** v419 (Ravi: "explore pe ek hi profile dikhe"): one card per Instagram handle. When two visible profiles share a handle
 *  (the same person made two accounts), the one an admin reviewed wins, then the claimed one, then more followers, then the
 *  older account. Rows without a handle are kept as they are. Order of the list is kept. */
export function dedupeByInstagram<T = any>(rows: T[]): T[] {
  if (!Array.isArray(rows)) return rows;
  const key = (r: any) => String(r?.instagram_handle || r?.handle || "").trim().toLowerCase().replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/^@+/, "").replace(/[/?#].*$/, "");
  const score = (r: any) => [r?.reviewed_at ? 1 : 0, r?.is_claimed === false || String(r?.creator_type || "").toLowerCase() === "unclaimed" ? 0 : 1, Number(r?.followers_instagram || r?.follower_count || r?.followers || 0) || 0, -(Date.parse(r?.created_at || "") || 0)];
  const better = (a: any, b: any) => { const x = score(a), y = score(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };
  const best = new Map<string, any>();
  for (const r of rows) { const k = key(r); if (!k) continue; const cur = best.get(k); if (!cur || better(r, cur)) best.set(k, r); }
  return rows.filter((r) => { const k = key(r); return !k || best.get(k) === r; });
}
