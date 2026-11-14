// Session 38 (Ravi: "Sub-admin ke paas full power hai ... theek kro").
//
// Before: most /admin routes only asked "is this admin OR sub-admin?". A sub-admin — or an
// account with role "admin" + team_role "sub_admin" — could release payouts, mark refunds,
// ban users and change fees, whatever boxes the super admin ticked in "Permissions".
// Only ~15 routes called checkAdminPerm.
//
// Now ONE gate runs before every /admin route (registered in server.ts before the route files):
//   - a full admin (role admin, team_role not sub_admin) passes, as before;
//   - anyone who is not admin staff passes the gate and is refused by the route's own check;
//   - a sub-admin needs the permission for that area (the same keys the super admin ticks in
//     User → Permissions: manage_escrow, manage_users, ...). Dashboard numbers are open to staff.
// An /admin path not in the map: a sub-admin may read it (GET) but not change anything.

import { isFullAdmin } from "./authSecurity";

/** First path segment after /admin → permission key. "*" = any staff member. */
export const ADMIN_AREA_PERMISSION: Record<string, string> = {
  // dashboard (read-only numbers)
  "stats": "*", "chart-data": "*", "pending-counts": "*", "growth": "*", // growth report: numbers for any staff; the reminder route checks manage_users itself
  // money
  "escrow": "manage_escrow", "transactions": "manage_escrow", "refunds": "manage_escrow",
  "refund-account": "manage_escrow", "settlements": "manage_escrow", /* v348 */ "ugc-refunds": "manage_escrow", "referral-withdrawals": "manage_escrow",
  // platform settings / tools — v294: one key per Platform Settings tab, so a designer can get
  // only Banners + Promo popups. "manage_settings" still means "all of Platform Settings"
  // (see PERMISSION_ALSO_ACCEPTS below), so existing sub-admins keep what they had.
  "settings": "manage_settings", "notifications": "manage_settings",
  "broadcast-email": "settings_broadcast", "broadcasts": "settings_broadcast",
  "maintenance": "settings_maintenance",
  "fee-config": "settings_fees", "fee-offer": "settings_fees",
  "coupons": "settings_coupons",
  "referral-program": "settings_referrals", "referral-list": "settings_referrals", "referrals": "settings_referrals",
  "whats-new": "settings_whats_new", "versions": "settings_whats_new",
  "promos": "settings_promos",
  "banners": "settings_banners",
  "landing-brands": "settings_landing", "landing-reviews": "settings_landing",
  "speed-report": "settings_speed",
  "follower-gate": "settings_signup", // v397: Platform Settings → Creator sign-up (minimum followers)
  // people
  "users": "manage_users", "creators": "manage_users", "enforcement": "manage_users", "templates": "manage_users",
  "waitlist": "manage_waitlist", "invoices": "manage_campaigns", /* v431 (Eva audit #9): Eva invoice insights — off-Ybex clients, GSTINs, values */
  "challenge": "manage_users", // v367: Diwali Challenge entries (marking winners = full admin only, checked in the route)
  "kyc": "manage_kyc", "verifications": "manage_kyc",
  "campaigns": "manage_campaigns", "pitch-leads": "manage_campaigns",
  "chat": "manage_chat", "chat_violations": "manage_chat", "chat_guard_violations": "manage_chat",
  "reports": "manage_disputes", "system-collabs": "manage_disputes", "agreements": "manage_disputes",
  "ugc": "manage_ugc",
  "logs": "manage_logs",
  "blog": "manage_blog", "faq": "manage_blog",
  "support": "manage_helpdesk", "helpdesk": "manage_helpdesk",
  // Session 58: user feedback + Eva 👍/👎 were readable by any sub-admin (unmapped GET).
  "feedback": "manage_helpdesk", "eva-feedback": "manage_helpdesk",
};

/** Extra keys that also open an area. "manage_settings" = all of Platform Settings (old behaviour);
 *  "manage_banners" is the old key the create-sub-admin box used for banners. */
export const PERMISSION_ALSO_ACCEPTS: Record<string, string[]> = {
  settings_broadcast: ["manage_settings"],
  settings_maintenance: ["manage_settings"],
  settings_fees: ["manage_settings"],
  settings_coupons: ["manage_settings"],
  settings_referrals: ["manage_settings"],
  settings_whats_new: ["manage_settings"],
  settings_promos: ["manage_settings"],
  settings_banners: ["manage_settings", "manage_banners"],
  settings_landing: ["manage_settings"],
  settings_speed: ["manage_settings"],
  settings_signup: ["manage_settings"],
};

export function acceptedPermissions(perm: string): string[] {
  return [perm, ...(PERMISSION_ALSO_ACCEPTS[perm] || [])];
}

export function isSubAdmin(user: any): boolean {
  if (!user) return false;
  const role = String(user.role || "").toLowerCase();
  const team = String(user.team_role || "").toLowerCase();
  return role === "sub_admin" || ((role === "admin" || role === "sub_admin") && team === "sub_admin");
}

/** Which permission a request needs, or null when no permission is needed. */
export function requiredAdminPermission(method: string, path: string): string | null {
  // Session 58: Express matches routes regardless of case — "/Admin/users" reached the admin routes but skipped
  // this gate. The path is compared in lower case (and with repeated slashes collapsed).
  const m = /^\/admin\/([^/?#]+)/.exec(String(path || "").toLowerCase().replace(/\/{2,}/g, "/"));
  if (!m) return null;
  const area = m[1];
  if (area === "bypass") return null; // demo login, has its own DEMO_LOGIN gate
  // v378 (QA M5): KYC decisions from the user panel (/admin/users/:id/kyc-action) need the KYC permission, not users.
  if (/^\/admin\/users\/[^/]+\/kyc-action\/?$/.test(String(path || "").toLowerCase().replace(/\/{2,}/g, "/"))) return "manage_kyc";
  const perm = ADMIN_AREA_PERMISSION[area];
  if (perm === "*") return null;
  if (perm) return perm;
  return String(method || "GET").toUpperCase() === "GET" ? null : "__full_admin_only__";
}

type GateDeps = {
  parseAuthUser: (req: any) => Promise<any>;
  checkAdminPerm: (user: any, perm: string) => Promise<boolean>;
};

export function adminPermissionGate({ parseAuthUser, checkAdminPerm }: GateDeps) {
  return async (req: any, res: any, next: any) => {
    const path = String(req.path || "").toLowerCase().replace(/\/{2,}/g, "/");
    if (!path.startsWith("/admin/")) return next();
    const perm = requiredAdminPermission(req.method, path);
    if (!perm) return next();
    let user: any = null;
    try { user = await parseAuthUser(req); } catch { user = null; }
    if (!user || isFullAdmin(user) || !isSubAdmin(user)) return next(); // route decides
    if (perm !== "__full_admin_only__") {
      for (const key of acceptedPermissions(perm)) {
        if (await checkAdminPerm(user, key)) return next();
      }
    }
    return res.status(403).json({
      error: "You don't have permission for this. Ask the super admin to enable it for you.",
      detail: "You don't have permission for this. Ask the super admin to enable it for you.",
      code: "ADMIN_PERMISSION_MISSING",
      permission: perm === "__full_admin_only__" ? null : perm,
    });
  };
}
