import React from "react";
import { Link2, MapPin, Building2 } from "lucide-react";

// v415: the preview shows only what the brand has really filled in — no fake "Connect" button, no
// Twitter/Facebook icons for links that were never added, no invented @handle, and calm static
// placeholders (no endless pulse) in the app's purple instead of blue.
export default function BrandLivePreview({ formData }) {
  const rawCompanyName = formData?.companyName?.trim() || "";
  const hasCustomName = rawCompanyName && rawCompanyName.toLowerCase() !== "your brand";
  const companyName = hasCustomName ? rawCompanyName : "";
  const displayName = companyName || null; // v415: CSS truncates; no hard cut at 15 letters

  // v415: only a handle the brand typed (was made up from the company name)
  const handle = String(formData?.instagramHandle || formData?.socialHandle || "").replace(/^@+/, "").trim();
  const description = formData?.description?.trim() || null;
  const category = formData?.industry?.trim() || null;

  const normalizeWebsiteUrl = (url) => {
    if (!url || typeof url !== "string") return "";
    const trimmed = url.trim();
    if (!trimmed) return "";
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    return `https://${trimmed}`;
  };

  const isValidUrl = (url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const rawWebsite = String(formData?.website || formData?.websiteUrl || formData?.website_url || "").trim();
  const websiteHref = normalizeWebsiteUrl(rawWebsite);
  const isValidWebsite = rawWebsite ? isValidUrl(websiteHref) : false;

  const location = formData?.city
    ? formData?.city + (formData?.state ? `, ${formData?.state}` : "")
    : null;

  const twitterUrl = formData?.twitterUrl || formData?.twitter_url || (formData?.twitterHandle ? `https://x.com/${formData.twitterHandle}` : "");
  const instagramUrl = formData?.instagramUrl || formData?.instagram_url || (handle && formData?.instagramHandle ? `https://instagram.com/${handle}` : "");
  const facebookUrl = formData?.facebookUrl || formData?.facebook_url || "";
  const socials = [
    twitterUrl && { key: "x", href: twitterUrl, label: "X (Twitter)", path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" },
    instagramUrl && { key: "ig", href: instagramUrl, label: "Instagram", path: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" },
    facebookUrl && { key: "fb", href: normalizeWebsiteUrl(facebookUrl), label: "Facebook", path: "M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z" },
  ].filter(Boolean);

  return (
    <div className="flex flex-col items-center justify-center w-full" data-testid="brand-live-preview">
      <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)] mb-3">How creators will see you</p>{/* v415 */}
      <div className="relative w-full max-w-[320px]">
        {/* The Card */}
        <div className="rounded-3xl overflow-hidden bg-white shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-slate-100">

          {/* Banner Area */}
          <div className="h-32 w-full relative bg-gradient-to-br from-[#1E1B4B] to-[var(--violet)] overflow-hidden">
            {/* Watermark */}
            {displayName && (
              <div className="absolute top-4 right-4 left-24 text-right opacity-40 select-none pointer-events-none">
                <span className="text-white font-display font-black text-2xl tracking-widest uppercase truncate block">{displayName}</span>
              </div>
            )}
          </div>

          {/* Card Body */}
          <div className="px-6 pb-7 relative">

            {/* Avatar */}
            <div className="-mt-10 mb-4 flex justify-start">
              <div className="w-[76px] h-[76px] rounded-full border-4 border-white bg-white shadow-sm overflow-hidden flex items-center justify-center relative z-10">
                {formData?.logoUrl ? (
                  <img src={formData.logoUrl} className="w-full h-full object-contain p-1" alt="Brand logo" />
                ) : companyName ? (
                  <div className="w-full h-full bg-[var(--violet)] flex items-center justify-center text-3xl font-bold text-white">
                    {companyName.charAt(0).toUpperCase()}
                  </div>
                ) : (
                  <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                    <Building2 className="w-8 h-8 text-slate-500" />
                  </div>
                )}
              </div>
            </div>

            {/* Name */}
            <h3 className="font-bold text-xl text-slate-900 truncate min-h-[28px]">
              {displayName || <span className="text-slate-400 font-semibold">Your brand name</span>}
            </h3>

            {/* Handle — only when the brand gave one */}
            <p className="text-[13px] text-slate-500 font-medium mb-4 min-h-[20px] truncate">
              {handle ? `@${handle}` : ""}
            </p>

            {/* Description */}
            <p className={`text-[13px] leading-relaxed min-h-[40px] mb-4 line-clamp-3 break-words ${description ? "text-slate-700" : "text-slate-400"}`}>
              {description || "Your brand description appears here."}
            </p>

            {/* Category */}
            <div className="mb-5">
              <span className={`inline-block px-3 py-1.5 rounded-full text-[10px] font-bold tracking-wider uppercase max-w-full truncate ${category ? "bg-[var(--violet-soft)] text-[var(--violet)]" : "bg-slate-100 text-slate-500"}`}>
                {category || "Category"}
              </span>
            </div>

            {/* Website Link — only when filled */}
            {rawWebsite && (
              <div className="flex items-center gap-2 mb-3 min-w-0">
                <Link2 size={16} className="text-[var(--violet)] shrink-0" />
                {isValidWebsite ? (
                  <a href={websiteHref} target="_blank" rel="noopener noreferrer" className="hover:underline text-slate-600 text-[13px] truncate">
                    {rawWebsite.replace(/^https?:\/\//i, "")}
                  </a>
                ) : (
                  <span className="truncate text-red-600 text-[13px]">{rawWebsite}</span>
                )}
              </div>
            )}

            {/* Location and Socials — only what was filled */}
            {(location || socials.length > 0) && (
              <div className="flex items-center justify-between mt-1 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {location && (
                    <>
                      <MapPin size={16} className="text-slate-500 shrink-0" />
                      <span className="truncate text-[13px] text-slate-600">{location}</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {socials.map((s) => (
                    <a key={s.key} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label} title={s.label}
                      className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d={s.path} /></svg>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
