// v353: initials picture made on the phone (no ui-avatars.com call) — works offline and never shows a broken image.
export function initialsAvatar(name, bg = "#7C3AED") {
  const parts = String(name || "Creator").trim().split(/\s+/).filter(Boolean);
  const txt = ((parts[0]?.[0] || "C") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase()
    .replace(/[<>&"']/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" fill="${bg}"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="52" font-weight="700" fill="#fff">${txt}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
