// v396 (QA report S-1, critical): many routes put the id from the URL straight into a PostgREST filter string
// (`.or(\`id.eq.${id},deal_id.eq.${id}\`)`). An id like "zz,id.neq.zz" turns that into "match every row" — one request
// by any creator set EVERY UGC order to SUBMITTED. Most of those routes are in LOCKED files (ugc_routes.ts,
// chat_routes.ts, payment_routes.ts …), so the guard sits in front of the whole API instead: an id-like value that
// contains a filter character ( , ( ) ) never reaches a route. Real ids (UUIDs, "thread_camp_…", "CRTR_UNCLAIMED_…",
// notification ids with ":" / ".") never contain them.
import type { Request, Response, NextFunction } from "express";

const BAD = /[,()]/;
// File / media paths can be real file names ("photo (1).jpg") — they never go into an .or() filter.
const SKIP = /^\/(files|media|uploads?|ota|blog)(\/|$)/i;
const ID_KEY = /(^id$|_id$|Id$|^id_)/;

/** Pure: true when a path segment / id value could break out of a PostgREST filter. */
export function unsafeIdValue(v: unknown): boolean {
  if (typeof v !== "string") return false;
  let s = v;
  try { s = decodeURIComponent(v); } catch { /* keep raw */ }
  return BAD.test(s);
}

/** Pure: which part of the request is unsafe ("" when fine). `path` is relative to /api. */
export function unsafeRequestPart(path: string, query: any, body: any): string {
  if (SKIP.test(path || "")) return "";
  for (const seg of String(path || "").split("/")) if (seg && unsafeIdValue(seg)) return "path";
  for (const [k, v] of Object.entries(query || {})) if (ID_KEY.test(k) && unsafeIdValue(v)) return `query.${k}`;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    for (const [k, v] of Object.entries(body)) if (ID_KEY.test(k) && unsafeIdValue(v)) return `body.${k}`;
  }
  return "";
}

/** Express middleware for app.use("/api", …). Must run after express.json(). */
export function idGuard(req: Request, res: Response, next: NextFunction) {
  const bad = unsafeRequestPart(req.path, req.query, req.body);
  if (bad) return res.status(400).json({ error: "Invalid id.", code: "BAD_ID" });
  next();
}
