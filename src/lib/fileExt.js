// Session 58: a file's extension for its storage path. `name.split('.').pop()` gave the WHOLE name when it had no dot
// ("video 2026 (1)"), and the server refuses paths with spaces / brackets — the upload failed.
const BY_TYPE = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/x-msvideo": "avi", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic", "application/pdf": "pdf" };
export function safeExt(file, fallback = "bin") {
  const name = String(file?.name || "");
  const dot = name.lastIndexOf(".");
  const fromName = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) : "";
  return fromName || BY_TYPE[String(file?.type || "").toLowerCase()] || String(file?.type || "").split("/")[1]?.replace(/[^a-z0-9]/gi, "").slice(0, 8) || fallback;
}
