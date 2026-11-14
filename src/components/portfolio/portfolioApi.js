// v363 (portfolio design): the server calls the portfolio screens make. Kept out of the screen file
// (src/pages/creator/profileScreens/* are layout-only — src/session49.test.js).
import { api } from "../../lib/api";

/** The creator's own last Instagram posts → { handle, media }. */
export async function fetchIgMedia() {
  const { data } = await api.post("creator/portfolio/ig-media", {});
  return { handle: data?.handle || "", media: Array.isArray(data?.media) ? data.media : [] };
}

/** A pasted Instagram link → its cover (copied to our storage) + numbers, when it's one of the creator's posts. */
export async function previewLink(url) {
  try {
    const { data } = await api.post("creator/portfolio/link-preview", { url });
    return data?.found ? data.item : null;
  } catch { return null; }
}

/** Instagram covers expire in days — copy the picked ones to our storage. → { id: url | null } */
export async function copyCovers(items) {
  const list = (items || []).filter((x) => x?.id && x?.url);
  const out = {};
  for (let i = 0; i < list.length; i += 12) {
    try {
      const { data } = await api.post("creator/portfolio/covers", { items: list.slice(i, i + 12) });
      Object.assign(out, data?.covers || {});
    } catch { /* saved without a cover — a placeholder shows */ }
  }
  return out;
}

/** Upload one file (image / video / cover) → its public link. Throws on failure. */
export async function uploadFile(fileOrBlob, name) {
  const fd = new FormData();
  fd.append("file", fileOrBlob, name || fileOrBlob?.name || "upload.jpg");
  const { data } = await api.post("upload?bucket=profile-assets", fd, { headers: { "Content-Type": "multipart/form-data" } });
  if (!data?.url) throw new Error("No link back from upload");
  return data.url;
}

/** First frame of a picked video → JPEG blob (null if the browser can't). */
export function videoCoverBlob(file) {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const v = document.createElement("video");
      v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
      const done = (b) => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } resolve(b); };
      const timer = setTimeout(() => done(null), 8000);
      v.onloadeddata = () => { try { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); } catch { clearTimeout(timer); done(null); } };
      v.onseeked = () => {
        try {
          const w = v.videoWidth || 540, h = v.videoHeight || 960;
          const scale = Math.min(1, 720 / Math.max(w, h));
          const c = document.createElement("canvas");
          c.width = Math.round(w * scale); c.height = Math.round(h * scale);
          c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
          c.toBlob((b) => { clearTimeout(timer); done(b); }, "image/jpeg", 0.82);
        } catch { clearTimeout(timer); done(null); }
      };
      v.onerror = () => { clearTimeout(timer); done(null); };
    } catch { resolve(null); }
  });
}
