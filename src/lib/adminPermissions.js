// v294 (Ravi): sub-admin permission options in ONE place — used by the "create sub-admin" box,
// the User → Permissions tab, the admin menu and Platform Settings.
// "manage_settings" = all of Platform Settings (old behaviour). The settings_* keys give one tab each.

export const SUB_ADMIN_MODULES = [
  { key: 'manage_users', label: 'Users', desc: 'Creators, brands, agencies, and unclaimed directory management' },
  { key: 'manage_waitlist', label: 'Waitlist', desc: 'Waitlist review, applications, and user invite queue' },
  { key: 'manage_kyc', label: 'KYC Checks', desc: 'Identity verification & user KYC document approvals' },
  { key: 'manage_campaigns', label: 'Approve Campaigns', desc: 'Review, approve, and manage brand campaigns' },
  { key: 'manage_chat', label: 'Chat Moderation', desc: 'Live chat monitoring and conversation moderation' },
  { key: 'manage_disputes', label: 'System Reports', desc: 'Disputes, report logs, fraud flags, and violations' },
  { key: 'manage_escrow', label: 'Escrowable Payments', desc: 'Wallet secure payment hold ledgers, balance holds, and payouts' },
  { key: 'manage_ugc', label: 'UGC Orders', desc: 'Track and oversee live UGC orders and deliverables' },
  { key: 'manage_logs', label: 'Active Logs', desc: 'System activity logs and administrative audit trail' },
  { key: 'manage_blog', label: 'Blogs and Content', desc: 'Create, publish, and edit blog posts & articles' },
  { key: 'manage_helpdesk', label: 'Help Desks', desc: 'Manage support tickets and customer help desk' },
];

// Platform Settings tabs (tab = id used in PlatformTools.jsx)
export const PLATFORM_SETTINGS_SUBS = [
  { key: 'settings_broadcast', tab: 'broadcast', label: 'Email Broadcast', desc: 'Send promotional emails to users' },
  { key: 'settings_maintenance', tab: 'maintenance', label: 'Maintenance', desc: 'Turn maintenance mode on / off' },
  { key: 'settings_fees', tab: 'fees', label: 'Fees & Risk Controls', desc: 'Platform fee, GST, payout freeze, budget limits' },
  { key: 'settings_coupons', tab: 'coupons', label: 'Coupons', desc: 'Create and manage coupon codes' },
  { key: 'settings_referrals', tab: 'referrals', label: 'Referrals', desc: 'Referral rewards and rules' },
  { key: 'settings_whats_new', tab: 'whats-new', label: "What's new", desc: 'New-feature popup for users' },
  { key: 'settings_promos', tab: 'promos', label: 'Promo popups', desc: 'Poster popups when the app opens + profile banner' },
  { key: 'settings_banners', tab: 'banners', label: 'Banners', desc: 'Home hero banners (Common / Creator / Brand)' },
  { key: 'settings_landing', tab: 'landing', label: 'Landing Page', desc: 'Landing page brands and reviews' },
  { key: 'settings_speed', tab: 'speed', label: 'Speed report', desc: 'App speed report' },
  { key: 'settings_signup', tab: 'signup', label: 'Creator sign-up', desc: 'Minimum Instagram followers to join' }, // v397
];

export const FULL_SETTINGS_KEY = 'manage_settings';

// v419 (Ravi: "Marketing ke andar bhi kuch-kuch cheezein select kar sakein, jaise Platform settings mein"): the
// permission picker follows the admin menu groups. Every row is an existing key, so the server checks don't change.
const sub = (tab) => PLATFORM_SETTINGS_SUBS.find((x) => x.tab === tab);
const mod = (key) => SUB_ADMIN_MODULES.find((x) => x.key === key);
export const PERMISSION_GROUPS = [
  { id: 'daily', label: 'Daily work', rows: [mod('manage_waitlist'), mod('manage_kyc'), mod('manage_campaigns'), { ...mod('manage_escrow'), label: 'Payouts & refunds' }, { ...mod('manage_helpdesk'), label: 'Help desk + Eva feedback' }, { ...mod('manage_disputes'), label: 'Reports & disputes' }, mod('manage_chat')] },
  { id: 'users', label: 'Users', rows: [{ ...mod('manage_users'), desc: 'All users, brands, creators, unclaimed (+ challenge entries)' }] },
  { id: 'money', label: 'Money', rows: [sub('fees'), sub('coupons'), sub('referrals')] },
  { id: 'orders', label: 'Orders & leads', rows: [{ ...mod('manage_ugc'), label: 'UGC orders' }] },
  { id: 'marketing', label: 'Marketing', rows: [{ ...mod('manage_blog'), label: 'Blogs & push notifications', desc: 'Write blogs and send push notifications' }, sub('broadcast'), sub('promos'), sub('banners'), sub('landing')] },
  { id: 'developer', label: 'Developer', rows: [sub('whats-new'), sub('signup'), sub('maintenance'), sub('speed'), { ...mod('manage_logs'), label: 'Activity logs' }] },
].map((g) => ({ ...g, rows: g.rows.filter(Boolean) }));

export function emptyPermissions() {
  const m = { [FULL_SETTINGS_KEY]: false, view_analytics: false };
  SUB_ADMIN_MODULES.forEach((x) => { m[x.key] = false; });
  PLATFORM_SETTINGS_SUBS.forEach((x) => { m[x.key] = false; });
  return m;
}

const isFullAdminUser = (u) => u?.role === 'admin' && u?.team_role !== 'sub_admin';
const isSubAdminUser = (u) => u?.team_role === 'sub_admin' || u?.role === 'sub_admin';

export function userHasAnyKey(user, keys) {
  if (isFullAdminUser(user)) return true;
  if (!isSubAdminUser(user) || !Array.isArray(user?.permissions)) return false;
  return user.permissions.some((p) => {
    if (typeof p === 'string') return keys.includes(p);
    if (p && typeof p === 'object') {
      const k = p.permission_key || p.key;
      return keys.includes(k) && (p.allowed === true || p.allowed === 1 || p.allowed === 'true');
    }
    return false;
  });
}

/** Keys that open one Platform Settings tab (own key, "all settings", and the old banners key). */
export function settingsTabKeys(sub) {
  return [sub.key, FULL_SETTINGS_KEY, ...(sub.key === 'settings_banners' ? ['manage_banners'] : [])];
}

export function settingsTabAllowed(user, tabId) {
  const sub = PLATFORM_SETTINGS_SUBS.find((s) => s.tab === tabId);
  if (!sub) return isFullAdminUser(user);
  return userHasAnyKey(user, settingsTabKeys(sub));
}

export function allowedSettingsTabs(user) {
  return PLATFORM_SETTINGS_SUBS.filter((s) => settingsTabAllowed(user, s.tab)).map((s) => s.tab);
}

/** Show the "Platform Settings" menu item when the person can open at least one tab. */
export function hasAnySettingsPerm(user) {
  return isFullAdminUser(user) || allowedSettingsTabs(user).length > 0;
}

/** Turn a saved list (strings or {permission_key, allowed}) into a {key: bool} map. */
export function permissionsToMap(list) {
  const m = emptyPermissions();
  (list || []).forEach((p) => {
    if (typeof p === 'string') m[p] = true;
    else if (p && typeof p === 'object') {
      const k = p.permission_key || p.key;
      if (k) m[k] = p.allowed === true || p.allowed === 1 || p.allowed === 'true';
    }
  });
  return m;
}

// v419 (Ravi: Marketing / Money / Developer as real pages): one permission check for a menu item, shared by the
// desktop sidebar, the hub pages and the phone admin. A settings tab (fees, banners…) uses its own Platform Settings key.
// v431 (admin audit #30): only aliases the SERVER also accepts (backend/adminPermissions.ts). Waitlist via manage_users,
// Chat via manage_campaigns, UGC orders via manage_escrow and Logs via manage_users showed a menu item whose lists the
// server then refused.
const ADMIN_PERM_ALIASES = {
  manage_disputes: ['manage_disputes', 'manage_reports'], manage_reports: ['manage_reports', 'manage_disputes'],
  manage_logs: ['manage_logs', 'manage_activity_logs'], manage_activity_logs: ['manage_activity_logs', 'manage_logs'],
  manage_banners: ['manage_banners', 'manage_settings'],
};
export function adminItemAllowed(user, item) {
  if (!item) return false;
  if (isFullAdminUser(user)) return true;
  if (item.full) return false;
  if (item.srcTab === 'settings' && item.srcView) return settingsTabAllowed(user, item.srcView);
  if (item.perm === 'manage_settings') return hasAnySettingsPerm(user);
  return userHasAnyKey(user, ADMIN_PERM_ALIASES[item.perm] || [item.perm]);
}
