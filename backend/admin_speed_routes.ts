// Session 31: admin "Speed report" + the one-time "make old photos small" job.
import express from "express";
import { instanceInfo, slowestRoutes, cloudRegion, supabaseRoundTrip } from "./speedStats";
import { PHOTO_BUCKETS, shrinkPhoto } from "./imageResize";

const isAdmin = (u: any) => Boolean(u) && (u.role === "admin" || u.team_role === "sub_admin" || u.role === "sub_admin");

/** Every file path in a bucket (Supabase lists one folder at a time). */
export async function listAllFiles(client: any, bucket: string, prefix = "", depth = 0, out: any[] = []): Promise<any[]> {
  if (depth > 4) return out;
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 100, offset });
    if (error) throw new Error(error.message);
    const rows = data || [];
    for (const f of rows) {
      const path = prefix ? `${prefix}/${f.name}` : f.name;
      if (!f.id) await listAllFiles(client, bucket, path, depth + 1, out); // a folder
      else out.push({ path, size: Number(f.metadata?.size || 0), type: String(f.metadata?.mimetype || "") });
    }
    if (rows.length < 100) break;
  }
  return out;
}

export function setupAdminSpeedRoutes(
  router: express.Router,
  { supabase, privilegedSupabase, parseAuthUser }: { supabase: any; privilegedSupabase: any; parseAuthUser: (req: any) => Promise<any> },
) {
  router.get("/admin/speed-report", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ error: "Admins only" });
    const [region, db] = await Promise.all([cloudRegion(), supabaseRoundTrip(privilegedSupabase || supabase)]);
    let supabaseHost: string | null = null;
    try { supabaseHost = new URL(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").host || null; } catch { /* not set */ }
    return res.json({
      measured_at: new Date().toISOString(),
      server: { ...instanceInfo(), region },
      database: { host: supabaseHost, round_trip: db },
      slowest_apis: slowestRoutes(10),
    });
  });

  // One-time job: shrink photos already in Storage. Same file path (so every saved link keeps
  // working), new small WebP content. dry_run=true only counts. Run per bucket; safe to repeat
  // (already-small files are skipped).
  router.post("/admin/maintenance/shrink-photos", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ error: "Admins only" });
    const client = privilegedSupabase;
    if (!client) return res.status(503).json({ error: "The server is not using the Supabase service key." });
    const bucket = String(req.body?.bucket || "");
    if (!PHOTO_BUCKETS[bucket]) return res.status(400).json({ error: `Bucket must be one of: ${Object.keys(PHOTO_BUCKETS).join(", ")}` });
    const dryRun = req.body?.dry_run !== false;
    const minBytes = 80 * 1024; // files already under 80 KB are left alone
    try {
      const files = await listAllFiles(client, bucket);
      const big = files.filter((f) => f.size > minBytes && /^image\//.test(f.type) && !/gif|svg/.test(f.type));
      const result: any = {
        bucket, dry_run: dryRun, files: files.length, to_shrink: big.length,
        bytes_before: big.reduce((s, f) => s + f.size, 0), bytes_after: 0, done: 0, failed: [] as string[],
      };
      if (dryRun) return res.json(result);
      for (const f of big) {
        try {
          const { data: blob, error } = await client.storage.from(bucket).download(f.path);
          if (error || !blob) throw new Error(error?.message || "download failed");
          const buf = Buffer.from(await blob.arrayBuffer());
          const small = await shrinkPhoto(buf, f.type, bucket);
          if (!small.shrunk) { result.bytes_after += buf.length; continue; }
          const { error: upErr } = await client.storage.from(bucket).upload(f.path, small.buffer, {
            contentType: small.contentType, upsert: true, cacheControl: "604800",
          });
          if (upErr) throw new Error(upErr.message);
          result.bytes_after += small.buffer.length;
          result.done++;
        } catch (e: any) {
          result.failed.push(`${f.path}: ${e?.message || e}`);
          result.bytes_after += f.size;
        }
      }
      return res.json(result);
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || String(e) });
    }
  });
}
