// Session 23. Faster login check.
//
// parseAuthUser ran two Supabase round trips, one after the other (session → user), for EVERY
// API request. A dashboard or inbox opening fires ~10 requests at once, so the same two lookups
// ran 10 times in parallel before any real work started.
//
// Now:
//   1. Identical lookups that are running at the same moment share one promise (in-flight
//      dedupe). Nothing is kept after it settles — the next request reads fresh.
//   2. token → user_id is remembered for a few seconds. A token never changes owner, so this is
//      safe; the only staleness is a just-deleted session living up to SESSION_TTL_MS on this
//      instance (logout clears it immediately via forgetToken).
//   The user ROW is never cached: role, ban and onboarding changes apply on the next request.
//   Every caller gets its own copy, so a handler that mutates `user` cannot affect another.

// v363 (Ravi: admin APIs ~2 s each — every request paid this lookup again after 5 s): 30 s. Logout still clears it
// at once on this server copy (forgetToken); the user row itself is still read fresh every request.
export const SESSION_TTL_MS = 30_000;
// v422 (Ravi, 10 Nov — Supabase free egress ran out): the users row was read on EVERY request (~9,000 reads a day).
// It is now kept 15 s per server copy. A ban / role change applies within 15 s (or at once on this copy via forgetUser).
export const ROW_TTL_MS = 15_000;

// The lookups are passed in per call, so the actual queries stay visible inside parseAuthUser
// (guarded by session20Fixes.test.ts: privileged client for sessions and users).
export type AuthLoaders = {
  sessionUserId: () => Promise<string | null>;               // this token -> user_id | null
  userRow: (sess: { user_id: string }) => Promise<any | null>;
};

export function createAuthLookupCache(opts: { now?: () => number } = {}) {
  const now = opts.now || (() => Date.now());
  const sessions = new Map<string, { uid: string; at: number }>();
  const inflightSession = new Map<string, Promise<string | null>>();
  const inflightUser = new Map<string, Promise<any | null>>();
  const rows = new Map<string, { row: any; at: number }>();

  async function userIdFor(token: string, loaders: AuthLoaders): Promise<string | null> {
    const hit = sessions.get(token);
    if (hit && now() - hit.at < SESSION_TTL_MS) return hit.uid;
    if (hit) sessions.delete(token);
    let p = inflightSession.get(token);
    if (!p) {
      p = loaders.sessionUserId().then((uid) => {
        if (uid) sessions.set(token, { uid: String(uid), at: now() });
        return uid ? String(uid) : null;
      }).finally(() => inflightSession.delete(token));
      inflightSession.set(token, p);
    }
    return p;
  }

  async function rowFor(uid: string, loaders: AuthLoaders): Promise<any | null> {
    const hitRow = rows.get(uid);
    if (hitRow && now() - hitRow.at < ROW_TTL_MS) return { ...hitRow.row };
    if (hitRow) rows.delete(uid);
    let p = inflightUser.get(uid);
    if (!p) {
      // only settled accounts are kept: during sign-up / onboarding the role and flags change from one request to the next
      p = loaders.userRow({ user_id: uid }).then((r) => { if (r && r.role && r.onboarded === true) rows.set(uid, { row: r, at: now() }); if (rows.size > 5000) rows.clear(); return r; }).finally(() => inflightUser.delete(uid));
      inflightUser.set(uid, p);
    }
    const row = await p;
    return row ? { ...row } : null;
  }

  return {
    async resolve(token: string, loaders: AuthLoaders): Promise<any | null> {
      if (!token) return null;
      const uid = await userIdFor(token, loaders);
      if (!uid) return null;
      return rowFor(uid, loaders);
    },
    forgetToken(token: string) { if (token) sessions.delete(token); },
    forgetUser(uid: string) { if (uid) rows.delete(String(uid)); },
    forgetAll() { sessions.clear(); rows.clear(); },
    _size() { return sessions.size; },
  };
}
