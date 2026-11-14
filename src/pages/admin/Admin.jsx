import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { toast } from 'sonner';

const AdminAnalytics = React.lazy(() => import('../../components/admin/AdminAnalytics')); // v419: each admin section loads only when opened
const AdminUsersTab = React.lazy(() => import('../../components/admin/AdminUsersTab')); // v419: each admin section loads only when opened
const WaitlistManager = React.lazy(() => import('../../components/admin/WaitlistManager')); // v419: each admin section loads only when opened
const KYCManager = React.lazy(() => import('../../components/admin/KYCManager')); // v419: each admin section loads only when opened
const CampaignReviewQueue = React.lazy(() => import('../../components/admin/CampaignReviewQueue')); // v419: each admin section loads only when opened
const AdminChatDashboard = React.lazy(() => import('../../components/chat/AdminChatDashboard')); // v419: each admin section loads only when opened
const EscrowDashboard = React.lazy(() => import('../../components/admin/EscrowDashboard')); // v419: each admin section loads only when opened
const AdminUgcManager = React.lazy(() => import('../../components/admin/AdminUgcManager')); // v419: each admin section loads only when opened
const AdminActivityLogsTab = React.lazy(() => import('../../components/admin/AdminActivityLogsTab')); // v419: each admin section loads only when opened
const BlogManager = React.lazy(() => import('../../components/admin/BlogManager')); // v419: each admin section loads only when opened
const PushNotificationsManager = React.lazy(() => import('../../components/admin/PushNotificationsManager')); // v419: each admin section loads only when opened
const AdminHelpdeskHub = React.lazy(() => import('../../components/admin/AdminHelpdeskHub')); // v419: each admin section loads only when opened
const SystemReports = React.lazy(() => import('../../components/admin/SystemReports')); // v419: each admin section loads only when opened
const PlatformTools = React.lazy(() => import('../../components/admin/PlatformTools')); // v419: each admin section loads only when opened
const AdminPitchLeads = React.lazy(() => import('../../components/admin/AdminPitchLeads')); // v419: each admin section loads only when opened
const AdminChallengeEntries = React.lazy(() => import('../../components/admin/AdminChallengeEntries')); // v419: each admin section loads only when opened
import AdminUniversalSearch from '../../components/admin/AdminUniversalSearch'; // v396
import AdminMobile from '../../components/admin/mobile/AdminMobile'; // v419: the phone admin (Admin Mobile design)
import useIsMobile from '../../hooks/useIsMobile';
import { adminHub } from '../../lib/adminSearch'; // v419: Money / Orders / Marketing / Developer pages
import { adminItemAllowed } from '../../lib/adminPermissions';
import { useAuth } from '../../contexts/AuthContext';
const InvoiceInsightsAdmin = React.lazy(() => import('../../components/assist/invoice/EvaInvoice').then((m) => ({ default: m.InvoiceInsightsAdmin }))); // v419: Eva invoices (marketing)

export default function Admin() {
  const location = useLocation();
  const navigate = useNavigate();
  const query = new URLSearchParams(location.search);
  const tab = query.get('tab') || 'dashboard';
  const role = query.get('role');
  const openId = query.get('open');
  const isMobile = useIsMobile();
  const mobileFull = query.get('full') === '1'; // v419: phone admin opened the full desktop section // v396: /admin?tab=users&open=<user_id> opens that person's page (campaign "View brand details", search)

  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState(false); // v330: failed load is not "No users found"
  const [banBusy, setBanBusy] = useState(false); // v330: no double ban / unban
  const [activeEnforcementUser, setActiveEnforcementUser] = useState(null);
  
  const loadUsers = async () => {
    try {
      setLoadingUsers(true);
      setUsersError(false); // v330
      const { data } = await api.get('/admin/users');
      setUsers(data?.users || data || []);
    } catch (error) {
      setUsersError(true); // v330
      console.error("Failed to load users", error);
      toast.error("Failed to load users");
    } finally {
      setLoadingUsers(false);
    }
  };

  // The users list is heavy; load it when the Users tab is opened, not on every admin page (session 27).
  const [usersLoaded, setUsersLoaded] = useState(false);
  useEffect(() => {
    if (tab === 'users' && !usersLoaded && (!isMobile || mobileFull)) { // v419: the phone admin loads its own list
      setUsersLoaded(true);
      loadUsers();
    }
  }, [tab, usersLoaded, isMobile, mobileFull]);
  // v396: open one user's page from a link, once the list is there
  useEffect(() => {
    if (tab !== 'users' || !openId || loadingUsers || (isMobile && !mobileFull)) return;
    const u = (users || []).find((x) => String(x.user_id || x.id) === String(openId));
    if (u) setActiveEnforcementUser(u);
    else if (!usersError && usersLoaded) toast.error("That account wasn't found in the users list.");
    const q = new URLSearchParams(location.search); q.delete('open');
    navigate(`/admin?${q.toString()}`, { replace: true });
  }, [tab, openId, loadingUsers, users]); // eslint-disable-line react-hooks/exhaustive-deps

  const banUser = async (userId, isBanned) => {
    if (banBusy) return; // v330
    try {
      setBanBusy(true); // v330
      if (isBanned) {
        await api.post(`/admin/users/${userId}/unban`);
        toast.success("User unbanned successfully");
      } else {
        if (!window.confirm("Are you sure you want to ban this user?")) return;
        await api.post(`/admin/users/${userId}/ban`);
        toast.success("User banned successfully");
      }
      loadUsers();
    } catch (error) {
      console.error("Ban action failed", error);
      toast.error(error?.response?.data?.error || "Failed to update ban status");
    } finally {
      setBanBusy(false); // v330
    }
  };

  // v419 (Ravi): a hub = one real page per group, with its own tab bar (like Platform settings), showing only its tools.
  const { user: me } = useAuth() || {};
  const renderHubItem = (it) => {
    if (it.srcTab === 'settings' && it.srcView) return <PlatformTools key={`hub-${it.srcView}`} forcedView={it.srcView} embedded />;
    return renderTabContent(it.srcTab);
  };
  const renderHub = (hub) => {
    const items = hub.items.filter((it) => adminItemAllowed(me, it));
    if (!items.length) return <div className="p-6 rounded-2xl border border-[var(--border-default)] text-sm text-[var(--text-secondary)]">You don't have access to {hub.group}. Ask the super admin to turn it on.</div>;
    const cur = items.find((it) => it.id === query.get('view')) || items[0];
    const open = (it) => { const q = new URLSearchParams(location.search); q.set('tab', hub.hub); q.set('view', it.id); ['role', 'open'].forEach((k) => q.delete(k)); navigate(`/admin?${q.toString()}`); };
    return (
      <div className="space-y-5 w-full" data-testid={`admin-hub-${hub.hub}`}>
        <div>
          <h2 className="text-2xl font-extrabold text-[var(--text-primary)] tracking-tight">{hub.group}</h2>
          {hub.desc && <p className="text-sm text-[var(--text-secondary)] font-medium mt-1">{hub.desc}</p>}
        </div>
        <div role="tablist" className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar border-b border-[var(--border-default)]">
          {items.map((it) => (
            <button key={it.id} type="button" role="tab" aria-selected={it.id === cur.id} onClick={() => open(it)} data-testid={`hub-tab-${it.id}`}
              className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap cursor-pointer transition-all ${it.id === cur.id ? 'bg-[#9D7CFF] text-white shadow-md shadow-[#9D7CFF]/20' : 'bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[#9D7CFF]/40'}`}>
              {it.label}
            </button>
          ))}
        </div>
        <div key={cur.id}>{renderHubItem(cur)}</div>
      </div>
    );
  };

  const renderTabContent = (forTab = tab) => {
    const hub = adminHub(forTab);
    if (hub) return renderHub(hub);
    switch (forTab) {
      case 'dashboard':
        return <AdminAnalytics onNavigate={(t) => navigate(`/admin?tab=${t}`)} />;
      case 'users':
        return (
          <AdminUsersTab 
            users={users} 
            load={loadUsers} 
            activeEnforcementUser={activeEnforcementUser}
            setActiveEnforcementUser={setActiveEnforcementUser}
            ban={banUser}
            initialRole={role}
            loading={loadingUsers} /* v330 */
            loadError={usersError}
          />
        );
      case 'waitlist':
        return <WaitlistManager />;
      case 'verifications':
        return <KYCManager />;
      case 'campaigns':
        return <CampaignReviewQueue />;
      case 'pitches':
        return <AdminPitchLeads />;
      case 'challenge':
        return <AdminChallengeEntries />;
      case 'chat':
        return <AdminChatDashboard />;
      case 'escrow':
        return <EscrowDashboard />;
      case 'ugc-orders':
        return <AdminUgcManager />;
      case 'activity-logs':
        return <AdminActivityLogsTab />;
      case 'blog':
        return <BlogManager />;
      case 'whats-new': // v419: What's new lives under Developer → settings
        return <PlatformTools key="whats-new" forcedView="whats-new" />;
      case 'push':
        return <PushNotificationsManager />;
      case 'helpdesk':
        return <AdminHelpdeskHub key="helpdesk" initial="tickets" single />;
      case 'feedback':
        return <AdminHelpdeskHub key="feedback" initial="chatbot" single />;
      case 'reports':
        return <SystemReports />;
      case 'invoices':
        return <React.Suspense fallback={null}><InvoiceInsightsAdmin /></React.Suspense>;
      case 'settings':
        return <PlatformTools key={query.get('view') || 'settings'} />; // v396: a search result opens the right settings tab
      // Session 43 (Ravi): Search Intelligence removed (it showed made-up numbers).
      default:
        return <AdminAnalytics onNavigate={(t) => navigate(`/admin?tab=${t}`)} />;
    }
  };

  const lazyTab = (t) => <React.Suspense fallback={<div className="p-6 text-sm text-gray-400">Loading…</div>}>{renderTabContent(t)}</React.Suspense>; // v419
  if (isMobile) return <AdminMobile renderSection={(t) => lazyTab(t)} />; // v419

  return (
    <div className="w-full h-full flex flex-col min-h-screen px-4 md:px-6 py-4 md:py-6">
      <AdminUniversalSearch />{/* v396 (Ravi): one search box for the whole admin — sections, settings, creators, brands, campaigns */}
      {lazyTab(tab)}
    </div>
  );
}
