// v346: one check for links people type (brand website, UGC product / sample link).
// Only http(s) links are allowed — "javascript:", "data:", "ftp:" etc. are rejected. A bare domain
// ("acme.in/shop") gets "https://" in front. Empty is allowed (the field is optional) → "".

/** { ok, url, error } — url is the cleaned link to save. */
export function checkHttpUrl(value, { label = "Link" } = {}) {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true, url: "", error: "" };
  const bad = { ok: false, url: raw, error: `${label} must be a web link starting with https:// (e.g. https://yourbrand.com).` };
  if (/\s/.test(raw)) return bad;
  let candidate = raw;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    if (!/^https?:\/\//i.test(raw)) return bad; // javascript:, data:, mailto:, ftp:, "http:/x"
  } else {
    candidate = `https://${raw.replace(/^\/+/, "")}`;
  }
  let u;
  try { u = new URL(candidate); } catch { return bad; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return bad;
  // a real host: has a dot (acme.in) and no empty labels, or localhost for local testing
  const host = u.hostname || "";
  if (!(host === "localhost" || (/\./.test(host) && !/^\.|\.\.|\.$/.test(host)))) return bad;
  return { ok: true, url: candidate, error: "" };
}

export const isHttpUrlOrEmpty = (value) => checkHttpUrl(value).ok;
