// Session 38 (Ravi: "Brand markup setting ko Supabase mein rakho").
//
// brand_markup_pct / agency_markup_pct (the % added to a creator's rate card when a brand or
// agency views it) and the matching deduction %s lived only in db_mock.json: per Cloud Run
// instance, reset on every deploy. They now live on the platform_fee_config row in Supabase
// (columns added by scripts/sql/session38.sql), next to the other fee settings.
//
// getSettings() is synchronous and called on hot paths (creator lists), so the server keeps the
// last Supabase values in memory and refreshes them every minute and right after a save.
// Without the columns (migration not run yet) everything falls back to the old local values.

export const MARKUP_KEYS = ["brand_markup_pct", "creator_deduction_pct", "agency_markup_pct", "agency_deduction_pct"] as const;

export const DEFAULT_PLATFORM_SETTINGS = {
  brand_markup_pct: 2.0,
  creator_deduction_pct: 2.0,
  agency_markup_pct: 5.0,
  agency_deduction_pct: 5.0,
};

const clampPct = (v: any) => Math.max(0, Math.min(50, Number(v)));

/** Only valid numbers from a request body / DB row, clamped to 0–50. */
export function pickMarkupSettings(src: any): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of MARKUP_KEYS) {
    const v = src?.[k];
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = clampPct(n);
  }
  return out;
}

type Deps = { getClient: () => any };

export function createPlatformSettingsStore({ getClient }: Deps) {
  let cloud: Record<string, number> | null = null;
  let columnsMissing = false;
  let missingAt = 0; // after the migration is run, the next check (≤ 10 min) picks it up

  async function refresh(): Promise<void> {
    const c = getClient();
    if (!c) return;
    if (columnsMissing && Date.now() - missingAt < 10 * 60 * 1000) return;
    try {
      const { data, error } = await c.from("platform_fee_config")
        .select(MARKUP_KEYS.join(", "))
        .order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (error) {
        if (/column|does not exist|42703/i.test(String(error.message || error.code || ""))) {
          if (!columnsMissing) console.warn("[platformSettings] markup columns missing on platform_fee_config — run scripts/sql/session38.sql. Using local values.");
          columnsMissing = true;
          missingAt = Date.now();
        }
        return;
      }
      columnsMissing = false;
      const picked = pickMarkupSettings(data);
      cloud = Object.keys(picked).length ? picked : null;
    } catch { /* keep the last good values */ }
  }

  /** Synchronous view: Supabase values over the local file over defaults. */
  function get(local: any) {
    return { ...DEFAULT_PLATFORM_SETTINGS, ...(local || {}), ...(cloud || {}) };
  }

  /** Saves to Supabase. Returns an error message, or null when saved. */
  async function save(patch: Record<string, number>): Promise<string | null> {
    if (!Object.keys(patch).length) return null;
    const c = getClient();
    if (!c) return "The server is not connected to the database.";
    if (columnsMissing) await refresh();
    if (columnsMissing) return "Run scripts/sql/session38.sql in Supabase first (adds the markup columns).";
    const { data: latest, error: readErr } = await c.from("platform_fee_config").select("id").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (readErr) return readErr.message || "Could not read the fee settings.";
    const row = { ...patch, updated_at: new Date().toISOString() };
    const { error } = latest?.id != null
      ? await c.from("platform_fee_config").update(row).eq("id", latest.id)
      : await c.from("platform_fee_config").insert([{ id: 1, ...row }]);
    if (error) {
      if (/column|does not exist|42703/i.test(String(error.message || error.code || ""))) { columnsMissing = true; missingAt = Date.now(); }
      return error.message || "Could not save.";
    }
    cloud = { ...(cloud || {}), ...patch };
    return null;
  }

  return { refresh, get, save, _state: () => ({ cloud, columnsMissing }) };
}
