// Storage helpers: bucket setup, signed URLs, base64 image upload. Moved out of server.ts in
// session 22 — behaviour unchanged. Which buckets stay private: backend/mediaAccess.ts.
import crypto from "crypto";
import { logIgnored } from "./logIgnored";
import { isPrivateBucket } from "./mediaAccess";
import { shrinkPhoto } from "./imageResize";

export function createStorageHelpers(clients: () => { supabase: any; privilegedSupabase: any }) {
  // Helper function to generate signed URLs for private storage buckets (content-submissions, kyc-documents, live-proofs, ugc-assets)
  async function getSignedUgcUrl(supabaseClient: any, originalUrl: any, defaultBucket = 'content-submissions') {
    if (!originalUrl || typeof originalUrl !== 'string') return originalUrl;
    const trimmed = originalUrl.trim();
    if (!trimmed || trimmed.startsWith('/uploads/') || trimmed.startsWith('/api/files/')) return originalUrl;

    // Check if it's an external HTTP/HTTPS URL not hosted in Supabase storage
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const privateBuckets = ['content-submissions', 'kyc-documents', 'live-proofs', 'ugc-assets'];
      const isSupabaseBucketUrl = privateBuckets.some(b => trimmed.includes(`/${b}/`));
      const isSupabaseStorageUrl = isSupabaseBucketUrl || trimmed.includes('/object/public/') || trimmed.includes('/object/sign/') || trimmed.includes('/storage/v1/');
      
      if (!isSupabaseStorageUrl) {
        // External link (e.g. Instagram, YouTube, Google Drive, Vimeo, or standard web link)
        return originalUrl;
      }
    }

    try {
      let bucket = defaultBucket;
      let filePath = trimmed;

      const privateBuckets = ['content-submissions', 'kyc-documents', 'live-proofs', 'ugc-assets'];
      
      for (const b of privateBuckets) {
        const marker = `${b}/`;
        const idx = filePath.indexOf(marker);
        if (idx !== -1) {
          bucket = b;
          filePath = decodeURIComponent(filePath.substring(idx + marker.length)).split('?')[0];
          break;
        }
      }

      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        const markerAlt = '/object/public/';
        const markerSign = '/object/sign/';
        let idx = filePath.indexOf(markerAlt);
        if (idx === -1) idx = filePath.indexOf(markerSign);
        if (idx !== -1) {
          const pathAfterObject = filePath.substring(idx + (filePath.indexOf(markerAlt) !== -1 ? markerAlt.length : markerSign.length));
          const parts = pathAfterObject.split('/');
          if (parts.length > 1) {
            bucket = parts[0];
            filePath = decodeURIComponent(parts.slice(1).join('/')).split('?')[0];
          }
        }
      } else {
        filePath = filePath.split('?')[0];
      }

      // Safeguard: If filePath is STILL an absolute http/https URL, do NOT call createSignedUrl on Supabase Storage bucket!
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        return originalUrl;
      }

      const activeClient = supabaseClient || clients().privilegedSupabase || clients().supabase;
      if (!activeClient) return originalUrl;

      const { data, error } = await activeClient.storage
        .from(bucket)
        .createSignedUrl(filePath, 60 * 60 * 24 * 7); // 7 days expiry

      if (!error && data?.signedUrl) {
        return data.signedUrl;
      } else if (error) {
        console.warn(`[Storage] Failed to create signed URL for ${filePath} in bucket '${bucket}': ${error.message}`);
      }
    } catch (err) {
      console.error('Error in getSignedUgcUrl:', err);
    }
    return originalUrl;
  }

  const checkedBuckets = new Set<string>();

  async function ensureBucketExists(bucketName: string, client: any) {
    if (!client) return;
    if (checkedBuckets.has(bucketName)) {
      return; // Already verified this bucket during this server run, avoid redundant API call
    }
    try {
      const { data: buckets, error } = await client.storage.listBuckets();
      if (error) {
        console.warn(`[Storage] Failed to list buckets: ${error.message}`);
        return;
      }
      const exists = buckets?.some((b: any) => b.id === bucketName);
      if (!exists) {
        // KYC and contract/document buckets must ALWAYS be private for data safety.
        // Public buckets are only for assets like banners, cover images, and profile pictures.
        const isPublic = !isPrivateBucket(bucketName); // deliverable buckets stay private — see mediaAccess.ts

        console.log(`[Storage] Bucket '${bucketName}' not found. Auto-creating as ${isPublic ? 'PUBLIC' : 'PRIVATE'}...`);
        let allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (bucketName.toLowerCase().includes('kyc') || bucketName.toLowerCase().includes('document')) allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf', 'image/webp'];
        else if (['content-submissions', 'live-proofs', 'ugc-assets'].includes(bucketName)) allowedMimeTypes = ['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime', 'application/pdf', 'image/webp'];
        
        const { error: createErr } = await client.storage.createBucket(bucketName, {
          public: isPublic,
          allowedMimeTypes
        });
        if (createErr) {
          console.warn(`[Storage] Failed to create ${isPublic ? 'public' : 'private'} bucket '${bucketName}':`, createErr.message);
        } else {
          console.log(`[Storage] Successfully auto-created ${isPublic ? 'public' : 'private'} bucket '${bucketName}'!`);
          checkedBuckets.add(bucketName);
        }
      } else {
        checkedBuckets.add(bucketName);
        const isPublic = !isPrivateBucket(bucketName); // deliverable buckets stay private — see mediaAccess.ts
        if (isPublic) {
          try {
            await client.storage.updateBucket(bucketName, { public: true });
          } catch (e) { logIgnored("server:2508", e); }
        }
      }
    } catch (err) {
      console.warn(`[Storage] Exception during bucket check/create for '${bucketName}':`, err);
    }
  }

  async function processBase64Image(imgUrl: string, bucket: string, user_id: string) {
    if (imgUrl && imgUrl.startsWith("data:image/")) {
      const activeSupabase = clients().privilegedSupabase || clients().supabase;
      if (activeSupabase) {
        try {
          await ensureBucketExists(bucket, activeSupabase);
          const matches = imgUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            // Session 31: shrink photos (avatars, logos, covers) before storing — backend/imageResize.ts
            const small = await shrinkPhoto(Buffer.from(matches[2], 'base64'), matches[1], bucket);
            const mimeType = small.contentType;
            const buffer = small.buffer;
            const extension = small.shrunk ? small.ext : (matches[1].split('/')[1] || 'jpeg');
            const filePath = `${user_id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
            const { error: uploadErr } = await activeSupabase.storage.from(bucket).upload(filePath, buffer, { contentType: mimeType, upsert: true, cacheControl: "31536000" }); // v428: unique file name → phones cache it for a year (Supabase egress)
            if (!uploadErr) {
              const privateBuckets = ['kyc-documents', 'content-submissions', 'live-proofs', 'ugc-assets'];
              if (privateBuckets.includes(bucket)) {
                const { data: signedData } = await activeSupabase.storage.from(bucket).createSignedUrl(filePath, 60 * 60 * 24 * 7);
                if (signedData && signedData.signedUrl) return signedData.signedUrl;
              } else {
                const { data: urlData } = activeSupabase.storage.from(bucket).getPublicUrl(filePath);
                if (urlData && urlData.publicUrl) return urlData.publicUrl;
              }
            } else {
              console.error(`[Storage] processBase64Image upload to '${bucket}' failed:`, uploadErr.message);
            }
          }
        } catch(e) { console.error("Error processing base64 image", e); }
      }
    }
    return imgUrl;
  }

  return { getSignedUgcUrl, ensureBucketExists, processBase64Image };
}

// ---------------------------------------------------------------------------------------------
// v429 (Ravi): the 15-day file cleanup. Delivered files are promised to stay 15 days after approval
// (src/lib/fileRetention.js), but nothing ever deleted them — the edge function was never scheduled.
// Ravi's rule: ONLY delete videos that were sent for content review (campaign deliverables / UGC
// videos in the content-submissions bucket). Nothing else: no KYC, avatars, logos, banners, other buckets.
//
// A file is deleted when ALL of these are true:
//   - bucket content-submissions, folder campaign-deliverables/ or ugc-videos/, a video file;
//   - uploaded 15+ days ago;
//   - and either its deal / UGC order FINISHED (completed, approved & paid, cancelled, refunded, expired)
//     15+ days ago, or no deal / order / chat exists for it any more (an orphan nobody can open).
// Anything still in progress or in review is never touched. Every delete is written to
// file_cleanup_audit_logs. Runs every 2 days; FILE_CLEANUP=off switches it off.

export const SUBMISSION_CLEANUP_DAYS = 15;
const CLEAN_BUCKET = "content-submissions";
const CLEAN_FOLDERS = ["campaign-deliverables/", "ugc-videos/"];
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi|3gp|hevc)$/i;
const DEAL_DONE = new Set(["COMPLETED", "CANCELLED", "CANCELED", "REFUNDED", "CLOSED", "RELEASED", "PAID", "SETTLED"]);
const ORDER_DONE = new Set(["APPROVED", "COMPLETED", "PAID", "CANCELLED", "CANCELED", "EXPIRED", "REFUNDED"]);

/** Which deal / order a stored file belongs to, from its name ("<threadId>-<ms>.mp4", "ugc-videos/<orderId>/…"). */
export function submissionOwner(path: string): { kind: "ugc" | "deal" | "thread"; id: string } | null {
  const p = String(path || "");
  const folder = CLEAN_FOLDERS.find((f) => p.startsWith(f));
  if (!folder) return null;
  const rest = p.slice(folder.length);
  const parts = rest.split("/");
  const base = parts.length > 1 ? parts[0] : parts[0].replace(/-\d{10,}\.[a-z0-9]+$/i, "");
  if (!base) return null;
  if (base.startsWith("ugcord_")) return { kind: "ugc", id: base };
  if (base.startsWith("thread_ugc_")) return { kind: "ugc", id: base.slice("thread_ugc_".length) };
  if (base.startsWith("thread_camp_")) return { kind: "deal", id: base.slice("thread_camp_".length) };
  return { kind: "thread", id: base };
}

const maxTime = (...vals: any[]) => {
  const t = vals.map((v) => (v ? Date.parse(v) : NaN)).filter((n) => Number.isFinite(n));
  return t.length ? Math.max(...t) : NaN;
};

/** When a deal / order finished, or null if it is still going. */
export function finishedAt(kind: "ugc" | "deal", row: any): number | null {
  if (!row) return null;
  const st = String(row.status || "").toUpperCase();
  if (kind === "deal") {
    if (!DEAL_DONE.has(st)) return null;
    const t = maxTime(row.updated_at);
    return Number.isFinite(t) ? t : null;
  }
  if (!ORDER_DONE.has(st)) return null;
  const t = maxTime(row.escrow_released_at, row.draft_approved_at, row.delivered_at, row.cancelled_at, row.expired_at, row.updated_at);
  return Number.isFinite(t) ? t : null;
}

/**
 * Pure decision for one file. ctx gives the rows found (missing = undefined).
 * Returns { del: true } only when it is safe; reason says why (kept or deleted).
 */
export function submissionFileDecision(
  file: { name: string; created_at?: string | null },
  ctx: { deal?: any; order?: any; threadFound?: boolean; lookupFailed?: boolean },
  now = Date.now(),
): { del: boolean; reason: string } {
  const cutoff = now - SUBMISSION_CLEANUP_DAYS * 86_400_000;
  if (!CLEAN_FOLDERS.some((f) => file.name.startsWith(f))) return { del: false, reason: "not_a_submission_folder" };
  if (!VIDEO_EXT.test(file.name)) return { del: false, reason: "not_a_video" };
  const up = file.created_at ? Date.parse(file.created_at) : NaN;
  if (!Number.isFinite(up) || up > cutoff) return { del: false, reason: "uploaded_under_15_days" };
  if (ctx.lookupFailed) return { del: false, reason: "lookup_failed" };
  const owner = submissionOwner(file.name);
  if (!owner) return { del: false, reason: "unknown_owner" };
  const row = owner.kind === "ugc" ? ctx.order : ctx.deal;
  if (!row) {
    // no deal / order / chat left for it → nobody can open it
    return ctx.threadFound ? { del: false, reason: "thread_without_deal" } : { del: true, reason: "orphan" };
  }
  const fin = finishedAt(owner.kind === "ugc" ? "ugc" : "deal", row);
  if (fin == null) return { del: false, reason: "still_in_progress" };
  if (fin > cutoff) return { del: false, reason: "finished_under_15_days" };
  return { del: true, reason: "finished_15_days_ago" };
}

async function listFolder(client: any, prefix: string, out: any[], depth = 0): Promise<void> {
  for (let offset = 0; offset < 100000; offset += 1000) {
    const { data, error } = await client.storage.from(CLEAN_BUCKET).list(prefix.replace(/\/$/, ""), { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`list ${prefix}: ${error.message || error}`);
    for (const o of data || []) {
      if (!o?.name) continue;
      if (!o.id) { if (depth < 2) await listFolder(client, `${prefix}${o.name}/`, out, depth + 1); continue; } // a sub-folder
      out.push({ name: `${prefix}${o.name}`, created_at: o.created_at || o.updated_at || null, size: Number(o.metadata?.size) || 0 });
    }
    if (!data || data.length < 1000) break;
  }
}

/** One cleanup run. dryRun → only reports. Never deletes more than maxDeletes files in one run. */
export async function runSubmissionCleanup(client: any, opts: { dryRun?: boolean; now?: number; maxDeletes?: number } = {}) {
  const now = opts.now ?? Date.now();
  const maxDeletes = opts.maxDeletes ?? 300;
  const files: any[] = [];
  for (const f of CLEAN_FOLDERS) await listFolder(client, f, files);

  const owners = files.map((f) => ({ f, o: submissionOwner(f.name) }));
  const ids = (kind: string) => [...new Set(owners.filter((x) => x.o?.kind === kind).map((x) => x.o!.id))];
  let lookupFailed = false;
  const fetchIn = async (table: string, cols: string, list: string[]) => {
    const map = new Map<string, any>();
    for (let i = 0; i < list.length; i += 200) {
      const { data, error } = await client.from(table).select(cols).in("id", list.slice(i, i + 200));
      if (error) { lookupFailed = true; continue; }
      for (const r of data || []) map.set(String(r.id), r);
    }
    return map;
  };
  const threads = await fetchIn("chat_threads", "id, deal_id, campaign_deal_id, ugc_order_id", ids("thread"));
  const dealIds = new Set(ids("deal"));
  const orderIds = new Set(ids("ugc"));
  for (const t of threads.values()) {
    const d = String(t.ugc_order_id || t.deal_id || t.campaign_deal_id || "");
    if (d.startsWith("ugcord_")) orderIds.add(d); else if (d) dealIds.add(d);
  }
  const deals = await fetchIn("deals", "id, status, updated_at", [...dealIds]);
  const orders = await fetchIn("ugc_orders", "id, status, escrow_released_at, draft_approved_at, delivered_at, cancelled_at, expired_at, updated_at", [...orderIds]);

  const decisions = owners.map(({ f, o }) => {
    let deal: any; let order: any; let threadFound = false;
    if (o?.kind === "deal") deal = deals.get(o.id);
    else if (o?.kind === "ugc") order = orders.get(o.id);
    else if (o?.kind === "thread") {
      const t = threads.get(o.id);
      threadFound = Boolean(t);
      const d = String(t?.ugc_order_id || t?.deal_id || t?.campaign_deal_id || "");
      if (d.startsWith("ugcord_")) order = orders.get(d); else if (d) deal = deals.get(d);
      if (order) return { file: f, ...submissionFileDecision(f, { order, lookupFailed }, now) , owner: o };
    }
    return { file: f, owner: o, ...submissionFileDecision(f, { deal, order, threadFound, lookupFailed }, now) };
  });
  const toDelete = decisions.filter((d) => d.del).slice(0, maxDeletes);
  const summary = {
    dry_run: Boolean(opts.dryRun), files_checked: files.length, to_delete: toDelete.length,
    mb_freed: Math.round(toDelete.reduce((a, d) => a + (d.file.size || 0), 0) / 1048576 * 10) / 10,
    kept: decisions.filter((d) => !d.del).reduce((m: Record<string, number>, d) => { m[d.reason] = (m[d.reason] || 0) + 1; return m; }, {}),
    deleted: 0, errors: [] as string[],
  };
  if (opts.dryRun || !toDelete.length) return { ...summary, files: toDelete.map((d) => ({ path: d.file.name, reason: d.reason })) };

  for (let i = 0; i < toDelete.length; i += 100) {
    const batch = toDelete.slice(i, i + 100);
    const { data, error } = await client.storage.from(CLEAN_BUCKET).remove(batch.map((d) => d.file.name));
    if (error) { summary.errors.push(String(error.message || error)); continue; }
    const gone = new Set((data || []).map((o: any) => o.name));
    for (const d of batch) {
      if (!gone.has(d.file.name)) continue;
      summary.deleted += 1;
      try {
        await client.from("file_cleanup_audit_logs").insert({
          id: crypto.randomUUID(), table_name: d.owner?.kind === "ugc" ? "ugc_orders" : "deals",
          record_id: d.owner?.id || null, file_path: `${CLEAN_BUCKET}/${d.file.name}`, deleted_at: new Date(now).toISOString(),
        });
      } catch (e) { logIgnored("submissionCleanup:audit", e); }
    }
  }
  return { ...summary, files: toDelete.map((d) => ({ path: d.file.name, reason: d.reason })) };
}

/** Every 2 days (first run 15 min after start). Needs the service-role client. FILE_CLEANUP=off stops it. */
export function startSubmissionCleanup(getClient: () => any) {
  if (String(process.env.FILE_CLEANUP || "").toLowerCase() === "off") return null;
  if (process.env.VITEST || process.env.NODE_ENV === "test") return null;
  const run = async () => {
    const c = getClient();
    if (!c?.storage) return;
    try {
      const r = await runSubmissionCleanup(c);
      console.log(`[file-cleanup] checked ${r.files_checked}, deleted ${r.deleted} (${r.mb_freed} MB)`, r.errors.length ? r.errors : "");
    } catch (e: any) { console.warn("[file-cleanup] skipped:", e?.message || e); }
  };
  const first: any = setTimeout(run, 15 * 60 * 1000); first.unref?.();
  const every: any = setInterval(run, 48 * 60 * 60 * 1000); every.unref?.(); // v429 (Ravi): every 2 days — a day late is fine
  return { first, every };
}
