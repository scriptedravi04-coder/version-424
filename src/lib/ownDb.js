import { api } from "./api";

// Session 22. Drop-in for `supabase.from(table)` WRITES on the user's own profile rows.
// The browser may no longer write these tables directly (RLS is SELECT-only); this sends the
// same upsert/insert/update/delete to /api/db/own, where the server writes the caller's own row
// only. Supports the chains the app uses: .upsert(v, opts) / .insert(v) / .update(v).eq(..) /
// .delete().eq(..).eq(..) — awaited directly, result { data, error } like supabase-js.
/**
 * @typedef {Promise<{ data: any, error: any }> & { eq: (col: string, val: any) => OwnQuery, select: (...a: any[]) => OwnQuery, single: () => OwnQuery, maybeSingle: () => OwnQuery }} OwnQuery
 * @returns {OwnQuery}
 */
function builder(table, op, values, options) {
  const match = {};
  // A real Promise that starts on the next microtask, so the .eq(...) calls chained
  // synchronously after .update()/.delete() are collected before the request goes out.
  /** @type {any} */
  const p = Promise.resolve().then(() =>
    api.post("/db/own", { table, op, values, match, options })
      .then((r) => ({ data: r?.data?.data ?? null, error: null }))
      .catch((e) => ({ data: null, error: e?.response?.data?.error || { message: e?.message || "Write failed" } }))
  );
  p.eq = (col, val) => { match[col] = val; return p; };
  p.select = () => p;
  p.single = () => p;
  p.maybeSingle = () => p;
  return p;
}

export const ownDb = {
  /** @param {string} table */
  from(table) {
    return {
      upsert: (/** @type {any} */ values, /** @type {any} */ options) => builder(table, "upsert", values, options),
      insert: (/** @type {any} */ values) => builder(table, "insert", values),
      update: (/** @type {any} */ values) => builder(table, "update", values),
      delete: () => builder(table, "delete"),
    };
  },
};
