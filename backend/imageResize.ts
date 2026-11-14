// Session 31 (Ravi): photos were ~0.8 MB each (avatars 27 files ≈ 22.5 MB, profile-assets 49 ≈ 24 MB,
// cover-images 21 ≈ 16 MB, brand-logos 31 ≈ 6.8 MB) and slowed every page that shows a face or logo.
// Every image going into these buckets is now made small before it is stored:
//   avatars / brand-logos / profile-assets → fits in 512×512, WebP (≈ 20–60 KB)
//   cover-images                           → 1200 px wide, WebP (a wide banner at 512 px looks blurry)
// GIF (may be animated), SVG (vector) and non-images are stored as they are. If shrinking fails or
// would make the file bigger, the original is kept — an upload never fails because of this step.
import sharp from "sharp";

export const PHOTO_BUCKETS: Record<string, { width: number; height: number; quality: number }> = {
  avatars: { width: 512, height: 512, quality: 76 },
  "brand-logos": { width: 512, height: 512, quality: 80 },
  "profile-assets": { width: 512, height: 512, quality: 76 },
  "cover-images": { width: 1200, height: 1200, quality: 72 },
  banners: { width: 1600, height: 900, quality: 75 },
};

const SKIP = /^image\/(gif|svg\+xml|svg)$/i;

export function shouldShrink(bucket: string, contentType: string): boolean {
  return Boolean(PHOTO_BUCKETS[bucket]) && /^image\//i.test(contentType || "") && !SKIP.test(contentType || "");
}

export async function shrinkPhoto(
  buffer: Buffer,
  contentType: string,
  bucket: string,
): Promise<{ buffer: Buffer; contentType: string; ext: string; shrunk: boolean }> {
  const keep = { buffer, contentType, ext: (contentType.split("/")[1] || "bin").replace("jpeg", "jpg"), shrunk: false };
  if (!buffer?.length || !shouldShrink(bucket, contentType)) return keep;
  const cfg = PHOTO_BUCKETS[bucket];
  try {
    const out = await sharp(buffer, { failOn: "none" })
      .rotate() // honour the phone's EXIF orientation before the metadata is dropped
      .resize({ width: cfg.width, height: cfg.height, fit: "inside", withoutEnlargement: true })
      .webp({ quality: cfg.quality })
      .toBuffer();
    if (out.length >= buffer.length) return keep;
    return { buffer: out, contentType: "image/webp", ext: "webp", shrunk: true };
  } catch (e: any) {
    console.warn(`[photos] could not shrink an image for '${bucket}': ${e?.message || e}`);
    return keep;
  }
}
