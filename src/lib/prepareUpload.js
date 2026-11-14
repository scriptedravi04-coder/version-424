// v408 (Ravi: "kisi ka KYC nahi ho raha" — the PAN photo never reached the server): photos straight from a phone camera
// can be HEIC (iPhone) or 5–12 MB, and some galleries send no file type at all — the server refused them and the screen
// only said "Couldn't upload". Before a KYC upload the photo is turned into a normal JPEG (max 2000 px) when it is
// HEIC / unknown / big. PDFs and small JPEG / PNG / WebP go as they are. If the phone can't read the photo, the
// original file is sent and the server's own message is shown.
const OK_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIDE = 2000;

export function needsConvert(file) {
  if (!file) return false;
  const t = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();
  if (t === "application/pdf" || name.endsWith(".pdf")) return false;
  if (/heic|heif/.test(t) || /\.(heic|heif)$/.test(name)) return true;
  if (!t || t === "application/octet-stream") return /\.(jpe?g|png|webp|heic|heif)$/.test(name) || !name.includes(".");
  if (OK_TYPES.includes(t)) return file.size > 3 * 1024 * 1024;
  return t.startsWith("image/");
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ img, url }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
    img.src = url;
  });
}

export async function prepareUpload(file) {
  if (!needsConvert(file) || typeof document === "undefined") return file;
  try {
    const { img, url } = await loadImage(file);
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (!w || !h) { URL.revokeObjectURL(url); return file; }
    const k = Math.min(1, MAX_SIDE / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * k); canvas.height = Math.round(h * k);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const blob = await new Promise((ok) => canvas.toBlob(ok, "image/jpeg", 0.86));
    if (!blob) return file;
    const base = String(file.name || "photo").replace(/\.[^.]*$/, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** The server's reason, else a clear default. */
export function uploadErrorText(err, fallback = "Couldn't upload the document. Please try again.") {
  const d = err?.response?.data;
  return (d && (d.detail || d.error)) || (err?.message === "Network Error" ? "No internet. Please check your connection and try again." : fallback);
}
