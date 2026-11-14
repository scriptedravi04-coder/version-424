// v348 (Ravi: "Eva login screen ke upar bhi aa rahi hai — sirf jo login karke app ke andar hai usi ko dikha,
// landing page pe bhi mat dikha"). One rule for the Eva promo poster and the desktop Eva bubble:
// they show only to a signed-in person on an app page — never on the landing page, login / signup,
// password / verify screens, public share / legal / blog pages or the admin panel.

const PUBLIC_EXACT = new Set(["/", "/app", "/terms", "/privacy", "/refunds", "/ugc", "/blog", "/help"]);
const PUBLIC_PREFIX = [
  "/login", "/signup", "/forgot-password", "/reset-password", "/verify", "/account-status", "/onboarding",
  "/app/", "/auth/", "/r/", "/b/", "/code/", "/apply", "/privacy-policy", "/delete-account", "/info/", "/blog/",
  "/help/", "/support/", "/creator-campaign-flow", "/admin", "/ybx-admin", "/y-admin", "/y.admin",
];

/** True for pages anyone can open without signing in (landing, login, legal, share links, admin). */
export function isPublicPage(pathname) {
  const p = String(pathname || "/").split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (PUBLIC_EXACT.has(p)) return true;
  return PUBLIC_PREFIX.some((x) => p === x.replace(/\/$/, "") || p.startsWith(x));
}

/** Eva / promo posters: signed in AND on an app page. */
export function showInAppExtras(pathname, user) {
  return Boolean(user && (user.user_id || user.id)) && !isPublicPage(pathname);
}
