// Session 31 (Ravi: "app slow lagta hai, tum apne hisaab se dekho"). Everything here is measured by
// this server instance and kept in memory only (resets when Cloud Run starts a new instance — which
// is itself useful: a short uptime = a cold start). Nothing is invented: no data → shown as "—".
const startedAt = Date.now();
let firstRequestAt: number | null = null;
let firstRequestMs: number | null = null;
let totalRequests = 0;

type Agg = { route: string; count: number; totalMs: number; maxMs: number; slow: number; errors: number; lastAt: number };
const routes = new Map<string, Agg>();
const MAX_ROUTES = 400;

/** "/api/deals/3f2a…/chat/123" → "/api/deals/:id/chat/:id" so one route is one row. */
export function routeKey(method: string, rawPath: string): string {
  const path = String(rawPath || "").split("?")[0]
    .split("/")
    .map((seg) => {
      if (!seg) return seg;
      if (/^\d+$/.test(seg)) return ":id";
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return ":id";
      if (/^[a-z]+_[a-z0-9]{6,}$/i.test(seg) && /\d/.test(seg)) return ":id"; // camp_ab12cd, file_x9…
      if (seg.length >= 20 && /\d/.test(seg) && /^[A-Za-z0-9_-]+$/.test(seg)) return ":id";
      return seg;
    })
    .join("/");
  return `${String(method || "GET").toUpperCase()} ${path}`;
}

export function recordRequest(method: string, path: string, ms: number, status: number, now = Date.now()) {
  totalRequests++;
  if (firstRequestAt == null) { firstRequestAt = now; firstRequestMs = ms; }
  const key = routeKey(method, path);
  let a = routes.get(key);
  if (!a) {
    if (routes.size >= MAX_ROUTES) {
      // Drop the least-recently-used route so memory stays small.
      let oldest: string | null = null, at = Infinity;
      for (const [k, v] of routes) if (v.lastAt < at) { at = v.lastAt; oldest = k; }
      if (oldest) routes.delete(oldest);
    }
    a = { route: key, count: 0, totalMs: 0, maxMs: 0, slow: 0, errors: 0, lastAt: now };
    routes.set(key, a);
  }
  a.count++;
  a.totalMs += ms;
  a.maxMs = Math.max(a.maxMs, ms);
  if (ms >= 1500) a.slow++;
  if (status >= 500) a.errors++;
  a.lastAt = now;
}

export function slowestRoutes(limit = 10) {
  return [...routes.values()]
    .map((a) => ({ route: a.route, calls: a.count, avg_ms: Math.round(a.totalMs / a.count), max_ms: a.maxMs, slow_calls: a.slow, errors: a.errors }))
    .sort((x, y) => y.avg_ms - x.avg_ms || y.max_ms - x.max_ms)
    .slice(0, limit);
}

export function instanceInfo(now = Date.now()) {
  const uptimeSec = Math.round((now - startedAt) / 1000);
  return {
    started_at: new Date(startedAt).toISOString(),
    uptime_seconds: uptimeSec,
    total_requests: totalRequests,
    first_request_at: firstRequestAt ? new Date(firstRequestAt).toISOString() : null,
    // How long after the instance started the first request came, and how long that request took.
    first_request_after_start_seconds: firstRequestAt ? Math.round((firstRequestAt - startedAt) / 1000) : null,
    first_request_ms: firstRequestMs,
    // A new instance that got its first request within ~20 s of starting = someone waited for a cold start.
    cold_start_likely: firstRequestAt != null && firstRequestAt - startedAt < 20000,
    service: process.env.K_SERVICE || null,
    revision: process.env.K_REVISION || null,
    memory_mb: Math.round(process.memoryUsage().rss / 1048576),
    node: process.version,
  };
}

/** Cloud Run region from the metadata server (null outside Google Cloud). */
export async function cloudRegion(timeoutMs = 800): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/region", {
      headers: { "Metadata-Flavor": "Google" },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const txt = (await r.text()).trim();
    return txt.split("/").pop() || null; // "projects/123/regions/asia-south1" → "asia-south1"
  } catch {
    return null;
  }
}

/** Time a tiny Supabase read a few times (ms). */
export async function supabaseRoundTrip(client: any, tries = 3) {
  if (!client) return null;
  const times: number[] = [];
  let error: string | null = null;
  for (let i = 0; i < tries; i++) {
    const t0 = Date.now();
    try {
      const { error: e } = await client.from("campaigns").select("campaign_id").limit(1);
      if (e) error = e.message;
    } catch (e: any) {
      error = e?.message || String(e);
    }
    times.push(Date.now() - t0);
  }
  return { tries: times, best_ms: Math.min(...times), avg_ms: Math.round(times.reduce((s, x) => s + x, 0) / times.length), error };
}

/** Test helper. */
export function _resetSpeedStats() {
  routes.clear(); totalRequests = 0; firstRequestAt = null; firstRequestMs = null;
}
