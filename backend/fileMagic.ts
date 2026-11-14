// v396: "do the first bytes match the type the browser claimed?" — used by multer uploads (server.ts magicCheck) and
// the base64 upload path in misc_routes.ts (QA S-5: an .exe went into a public bucket that way). Pure.
export const fileLooksLike = (f: any): boolean => {
  const b: Buffer | undefined = f?.buffer; const t = String(f?.mimetype || "");
  if (!b || b.length < 4) return false;
  const hex = b.subarray(0, 12).toString("hex");
  const ascii = b.subarray(0, 12).toString("latin1");
  if (t === "image/jpeg") return hex.startsWith("ffd8ff");
  if (t === "image/png") return hex.startsWith("89504e47");
  if (t === "image/gif") return ascii.startsWith("GIF8");
  if (t === "image/webp") return ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP";
  if (t === "application/pdf") return ascii.startsWith("%PDF");
  if (t === "image/heic" || t === "image/heif") return isHeicBytes(b); // v417: iPhone photos (base64 path refused them)
  if (t === "video/mp4" || t === "video/quicktime") return ascii.slice(4, 8) === "ftyp" || ascii.slice(4, 8) === "moov" || ascii.slice(4, 8) === "wide" || ascii.slice(4, 8) === "mdat";
  if (t === "video/x-msvideo" || t === "audio/wav") return ascii.startsWith("RIFF");
  if (t === "application/msword") return hex.startsWith("d0cf11e0");
  if (t.includes("wordprocessingml")) return hex.startsWith("504b0304");
  if (t === "audio/mpeg") return ascii.startsWith("ID3") || hex.startsWith("fff");
  if (t === "audio/webm") return hex.startsWith("1a45dfa3");
  return false;
};

/** v408 (Ravi: "KYC nahi ho raha" — PAN photo from some Android galleries / WhatsApp comes as application/octet-stream or
 *  with no type, and was refused): the real type from the first bytes, or "" if unknown. Pure. */
export const sniffType = (b?: Buffer): string => {
  if (!b || b.length < 12) return "";
  const hex = b.subarray(0, 12).toString("hex");
  const ascii = b.subarray(0, 12).toString("latin1");
  if (hex.startsWith("ffd8ff")) return "image/jpeg";
  if (hex.startsWith("89504e47")) return "image/png";
  if (ascii.startsWith("GIF8")) return "image/gif";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "image/webp";
  if (ascii.startsWith("%PDF")) return "application/pdf";
  if (isHeicBytes(b)) return "image/heic"; // v417
  return "";
};

// v417: HEIC / HEIF = ISO box "ftyp" + a HEIC-family brand (heic / heix / mif1 / msf1 / hevc …). Pure.
export const HEIC_BRANDS = /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/;
export function isHeicBytes(b?: Buffer): boolean {
  if (!b || b.length < 12) return false;
  const a = b.subarray(0, 12).toString("latin1");
  return a.slice(4, 8) === "ftyp" && HEIC_BRANDS.test(a.slice(8, 12));
}

// v417: chat attachments — the one server rule (same as the app): photos, MP4/MOV video, PDF; max 50 MB.
export const CHAT_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;
export const CHAT_ATTACHMENT_EXTS = ["jpg", "jpeg", "png", "webp", "heic", "heif", "gif", "mp4", "mov", "pdf"];
export const CHAT_ATTACHMENT_MIMES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif", "video/mp4", "video/quicktime", "application/pdf"];
export const CHAT_ATTACHMENT_TYPE_ERROR = "You can send photos (JPG, PNG, WEBP, HEIC, GIF), MP4 or MOV videos, and PDFs.";
export const CHAT_ATTACHMENT_SIZE_ERROR = "This file is too big. The limit is 50 MB.";
/** v417: null = OK, else the plain message to show. Checks only what is given (path ext, claimed type, size). Pure. */
export function chatAttachmentProblem(f: { path?: any; contentType?: any; size?: any }): string | null {
  const p = String(f?.path || "");
  if (p) {
    const ext = (p.match(/\.([A-Za-z0-9]{1,8})$/)?.[1] || "").toLowerCase();
    if (!CHAT_ATTACHMENT_EXTS.includes(ext)) return CHAT_ATTACHMENT_TYPE_ERROR;
  }
  const t = String(f?.contentType || "").toLowerCase().split(";")[0].trim();
  if (t && !GENERIC_TYPES.has(t) && !CHAT_ATTACHMENT_MIMES.includes(t)) return CHAT_ATTACHMENT_TYPE_ERROR;
  const n = Number(f?.size);
  if (f?.size !== undefined && f?.size !== null && f?.size !== "" && Number.isFinite(n) && n > CHAT_ATTACHMENT_MAX_BYTES) return CHAT_ATTACHMENT_SIZE_ERROR;
  return null;
}
export const GENERIC_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream", "image/jpg", "image/pjpeg"]);
