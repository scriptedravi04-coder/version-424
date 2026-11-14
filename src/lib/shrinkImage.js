// Session 31: a few screens upload photos straight to Supabase Storage (not through /api/upload,
// which shrinks them on the server — backend/imageResize.ts). This makes those photos small in the
// browser first: fits in `max` px, WebP. If anything fails, the original file is used unchanged.
export async function shrinkImageFile(file, { max = 512, quality = 0.78 } = {}) {
  try {
    if (!file || !/^image\//.test(file.type) || /gif|svg/i.test(file.type)) return file;
    if (typeof window === "undefined" || typeof window.createImageBitmap !== "function") return file;
    const bmp = await window.createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise((res) => canvas.toBlob(res, "image/webp", quality));
    if (!blob || blob.type !== "image/webp" || blob.size >= file.size) return file;
    const name = (file.name || "photo").replace(/\.[a-z0-9]+$/i, "") + ".webp";
    return new File([blob], name, { type: "image/webp" });
  } catch {
    return file;
  }
}
