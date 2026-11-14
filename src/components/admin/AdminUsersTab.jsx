import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Ban, Trash2, UserPlus, X, Pencil, CheckCircle2, Clock, XCircle, CreditCard, RotateCcw } from 'lucide-react';
import UserEnforcementPanel from './UserEnforcementPanel';
import CreatorProfileEditModal from './CreatorProfileEditModal';
import { api } from '../../lib/api';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import DeleteAccountPanel from './DeleteAccountPanel';

import SubAdminPermissionPicker from './SubAdminPermissionPicker';
import { emptyPermissions } from '../../lib/adminPermissions';
import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";
import AdminInstagramBulkFetch from "./AdminInstagramBulkFetch"; // v354
import AdminCreatorFilters from "./AdminCreatorFilters"; // v396
import { applyCreatorFilters, EMPTY_CREATOR_FILTERS, profileStatusOf, STATUS_STYLE } from "../../lib/adminCreatorFilters"; // v396

// v332: calm error text (never raw "Request failed with status code 500").
const calmError = (err, fallback) => {
  const m = err?.response?.data?.error || err?.response?.data?.detail;
  return typeof m === "string" && m && m.length < 160 ? m : fallback;
};
// v332: search placeholder used to read "Search agencys / unclaimeds / deleteds…".
const SEARCH_NOUN = { brand: "brands", agency: "agencies", creator: "creators", unclaimed: "unclaimed creators", admin: "admins", admins: "admins", sub_admins: "sub-admins", deleted: "deleted accounts" };
export default function AdminUsersTab({ users, load, activeEnforcementUser, setActiveEnforcementUser, ban, initialRole, loading = false, loadError = false }) {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const isFullAdmin = currentUser?.role === 'admin' && currentUser?.team_role !== 'sub_admin';

  const [filterRole, setFilterRole] = useState(initialRole || 'all');
  const [deletingUser, setDeletingUser] = useState(null);
  const [adminFilter, setAdminFilter] = useState('all_admins'); // all_admins, admins, sub_admins
  const [searchQuery, setSearchQuery] = useState('');
  const [creatorFilters, setCreatorFilters] = useState(EMPTY_CREATOR_FILTERS); // v396: Explore-style filters on Creators / Unclaimed
  const [editingCreator, setEditingCreator] = useState(null);

  // Create Modal States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('admin');
  const [newTeamRole, setNewTeamRole] = useState('sub_admin');
  const [homePicks, setHomePicks] = useState({});
  const [homePickBusy, setHomePickBusy] = useState(null);

  useEffect(() => {
    let mounted = true;
    api.get("/creators/home-picks").then((res) => {
      if (mounted && res.data?.picks) {
        const m = {};
        res.data.picks.forEach((p) => { m[p.id] = true; });
        setHomePicks(m);
      }
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  const toggleHomePick = async (uid, on) => {
    setHomePickBusy(uid);
    try {
      const res = await api.post(`admin/creators/${uid}/home-pick`, { on });
      setHomePicks((p) => ({ ...p, [uid]: on }));
      // v346: saved, but the server says it won't show yet (not approved / no photo).
      const warning = res?.data?.warning;
      if (on && warning) toast.warning(`Saved. ${warning}`);
      else toast.success(on ? "Shown on the creator home" : "Removed from the creator home");
    } catch (e) {
      toast.error(calmError(e, "Couldn't save. Please try again.")); // v332
    } finally {
      setHomePickBusy(null);
    }
  };
  const [newPermissions, setNewPermissions] = useState(emptyPermissions());
  const [creating, setCreating] = useState(false);

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    if (!newEmail || !newPassword) {
      return toast.error('Email and password are required.');
    }
    setCreating(true);
    try {
      const { data, error } = await api.post('/admin/users/create', {
        email: newEmail,
        password: newPassword,
        role: newRole,
        team_role: newRole === 'admin' ? newTeamRole : null,
        permissions: newRole === 'admin' && newTeamRole === 'sub_admin' ? Object.keys(newPermissions).filter(k => newPermissions[k]) : []
      });
      if (error) throw new Error(error);
      toast.success('User created successfully!');
      setShowCreateModal(false);
      setNewEmail('');
      setNewPassword('');
      setNewTeamRole('sub_admin');
      setNewPermissions(emptyPermissions());
      load();
    } catch (err) {
      toast.error(calmError(err, "Couldn't create the account. Please try again.")); // v332
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    if (initialRole) {
      setFilterRole(initialRole);
      if (initialRole === 'admin') {
        setAdminFilter('all_admins');
      }
    } else {
      setFilterRole('all');
    }
  }, [initialRole]);

  const handleSelectRole = (newRoleKey) => {
    setFilterRole(newRoleKey);
    navigate(`/admin?tab=users&role=${newRoleKey}${typeof window !== "undefined" && new URLSearchParams(window.location.search).get("full") === "1" ? "&full=1" : ""}`, { replace: true }); // v431 (audit #33)
  };

  const activeRole = filterRole || initialRole || 'all';

  const roleUsers = (users || []).filter(u => {
    const sq = searchQuery.toLowerCase();
    const userRoleStr = u.role === 'admin' ? (u.team_role === 'sub_admin' ? 'sub_admin' : 'admin') : (u.role || '');
    const userPhoneStr = u.phone || u.mobile || u.creator_profile?.phone || u.brand_profile?.phone || '';
    const matchesSearch = (u.name || '').toLowerCase().includes(sq) || 
                          (u.email || '').toLowerCase().includes(sq) ||
                          userPhoneStr.toLowerCase().includes(sq) ||
                          userRoleStr.toLowerCase().includes(sq) ||
                          (u.creator_profile?.instagram_handle || '').toLowerCase().includes(sq) ||
                          (u.brand_profile?.company_name || u.brand_setup?.company_name || '').toLowerCase().includes(sq); // v375: search brands by company name
    if (!matchesSearch) return false;
    
    if (activeRole === 'deleted') {
      return u.is_deleted === true;
    }
    
    // Hide deleted users everywhere else
    if (u.is_deleted) return false;

    // Sub-admins can NEVER view or manage Admins or Sub-Admins
    if (!isFullAdmin && (u.role === 'admin' || u.team_role === 'sub_admin' || u.role === 'sub_admin')) {
      return false;
    }

    const isAgency = u.role === 'brand' && (u.is_agency === true || u.brand_profile?.is_agency === true); // v396: only brand accounts
    const isUnclaimed = (u.role === 'creator' || Boolean(u.creator_profile) || u.source === 'waitlist' || u.source === 'waitlist_form' || u.auth_method === 'unclaimed' || u.is_unclaimed === true) && (u.is_claimed === false || u.creator_profile?.is_claimed === false || u.auth_method === 'unclaimed' || u.is_unclaimed === true || u.is_registered_user === false);

    if (activeRole === 'brand') {
      return u.role === 'brand' && !isAgency;
    }
    if (activeRole === 'agency') {
      return u.role === 'brand' && isAgency;
    }
    if (activeRole === 'creator') {
      return u.role === 'creator' && !isUnclaimed;
    }
    if (activeRole === 'unclaimed') {
      return isUnclaimed;
    }
    if (activeRole === 'admin') {
      if (!isFullAdmin) return false;
      if (adminFilter === 'admins') return u.role === 'admin';
      if (adminFilter === 'sub_admins') return u.team_role === 'sub_admin';
      return u.role === 'admin' || u.team_role === 'sub_admin';
    }
    if (activeRole === 'admins') return isFullAdmin && u.role === 'admin';
    if (activeRole === 'sub_admins') return isFullAdmin && u.team_role === 'sub_admin';
    return true;
  });
  // v396: Explore-style filter panel, only on the Creators and Unclaimed lists.
  const showCreatorFilters = activeRole === 'creator' || activeRole === 'unclaimed';
  const filteredUsers = showCreatorFilters ? applyCreatorFilters(roleUsers, creatorFilters) : roleUsers;
  const filterCities = showCreatorFilters ? Array.from(new Set(roleUsers.map(u => String(u.creator_profile?.city || u.city || '').trim()).filter(Boolean))).sort() : [];

  // Recycle Bin: a normal delete can be undone here (session 27).
  const [restoringId, setRestoringId] = useState(null);
  const handleRestore = async (userObj) => {
    const userId = userObj.user_id || userObj.id;
    setRestoringId(userId);
    try {
      await api.post(`/admin/users/${userId}/restore`, {});
      toast.success(`${userObj.name || userObj.email || 'Account'} restored`);
      if (load) load();
    } catch (err) {
      toast.error(calmError(err, "Couldn't restore the account. Please try again.")); // v332
    } finally {
      setRestoringId(null);
    }
  };
  // Two ways to delete (session 27): normal (bin) or complete wipe — chosen in DeleteAccountPanel.
  const handleRemoveCreator = (userObj) => setDeletingUser(userObj);



  const deleteDialog = deletingUser ? (
    <PopupBackdrop className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40" onClick={() => setDeletingUser(null)}>
      <PopupPanel kind="modal" className="bg-white rounded-2xl w-full max-w-lg p-5 shadow-2xl max-h-[90dvh] overflow-y-auto" /* v330: scrollable */ onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-extrabold text-gray-900 min-w-0 break-words pr-3">{/* v332: long emails wrap */}Delete {deletingUser.name || deletingUser.creator_profile?.name || deletingUser.email || "account"}</h3>
          <button type="button" onClick={() => setDeletingUser(null)} className="text-gray-500 hover:text-gray-700 text-sm font-bold cursor-pointer">Close</button>
        </div>
        <DeleteAccountPanel user={deletingUser} onDone={() => { setDeletingUser(null); if (load) load(); }} />
      </PopupPanel>
    </PopupBackdrop>
  ) : null;

  if (activeEnforcementUser) {
    return (
      <UserEnforcementPanel 
        user={activeEnforcementUser} 
        onBack={() => setActiveEnforcementUser(null)} 
        onUserUpdate={load}
        homePicks={homePicks}
        toggleHomePick={toggleHomePick}
        homePickBusy={homePickBusy}
      />
    );
  }

  // Determine beautiful custom header based on role
  let title = "User Management";
  let description = "Manage accounts, sub-admins, and platform users.";
  
  if (activeRole === 'brand') {
    title = "Brand Directory";
    description = "Manage all registered brand accounts and view their profile details.";
  } else if (activeRole === 'agency') {
    title = "Agencies Directory";
    description = "Manage marketing and influencer agencies managing multiple brand profiles.";
  } else if (activeRole === 'creator') {
    title = "Creator Directory";
    description = "Manage all registered content creators and verify their profiles.";
  } else if (activeRole === 'unclaimed') {
    title = "Unclaimed Creators Directory";
    description = "Shadow creator profiles auto-created from approved public waitlist applications.";
  } else if (activeRole === 'admin' || activeRole === 'admins' || activeRole === 'sub_admins') {
    title = "Admins & Sub-Admins";
    description = "Manage platform administrators, sub-admins, and access control.";
  } else if (activeRole === 'deleted') {
    title = "Recycle Bin";
    description = "View and restore recently deleted or deactivated accounts.";
  }

  return (
    <div className="space-y-6 font-sans w-full animate-in fade-in duration-200">
       {deleteDialog}
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
         <div>
           <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">{title}</h2>
           <p className="text-sm text-gray-500 font-medium mt-1">{description}</p>
         </div>
         {["all", "creator", "unclaimed"].includes(String(activeRole)) && <AdminInstagramBulkFetch />}{/* v354; v419 small, top right */}
       </div>

       <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row justify-between gap-4 mb-6">
             <div className="relative flex items-center gap-3 flex-1 flex-wrap">{/* v421 (Ravi): Filters sits right next to the search box */}
             <div className="relative flex-1 min-w-[220px] max-w-md">
               <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
               <input 
                 type="text" 
                 placeholder={activeRole !== 'all' ? `Search ${SEARCH_NOUN[activeRole] || 'users'} by name, email or phone...` : 'Search users by name, email, phone or handle...'} /* v332 */
                 value={searchQuery}
                 onChange={e => setSearchQuery(e.target.value)}
                 // v330: 16px on phones so iOS doesn't zoom
                 className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-[16px] sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#E9D5FF] focus:border-[#C084FC]"
               />
             </div>
             {showCreatorFilters && (
               <AdminCreatorFilters value={creatorFilters} onChange={setCreatorFilters} shown={filteredUsers.length} total={roleUsers.length} extraCities={filterCities} />
             )}
             </div>

             {/* Role Filters & Bin */}
             <div className="flex gap-2 items-center flex-wrap justify-end">
               {isFullAdmin && (activeRole === 'admin' || activeRole === 'admins' || activeRole === 'sub_admins') && (
                 <button 
                   onClick={() => setShowCreateModal(true)}
                   className="px-4 py-2 bg-[#A855F7] hover:bg-[#9333EA] text-white rounded-xl text-xs font-extrabold uppercase tracking-widest flex items-center gap-2 transition-colors shadow-sm"
                 >
                   <UserPlus size={14} /> Create New
                 </button>
               )}
               {isFullAdmin && (activeRole === 'admin' || activeRole === 'admins' || activeRole === 'sub_admins') && (
                 <div className="flex gap-2">
                   {[
                     { id: 'all_admins', label: 'All Admin Roles' },
                     { id: 'admins', label: 'Admins' },
                     { id: 'sub_admins', label: 'Sub-Admins' }
                   ].map(r => (
                     <button 
                       key={r.id}
                       onClick={() => setAdminFilter(r.id)}
                       className={`px-3 py-1.5 rounded-lg text-xs font-extrabold uppercase tracking-widest transition-colors ${adminFilter === r.id ? 'bg-[#F3E8FF] text-[#7E22CE] border border-[#E9D5FF]' : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'}`}
                     >
                       {r.label}
                     </button>
                   ))}
                 </div>
               )}

               {/* v419 (Ravi): the All / Brands / Agencies / Creators / Unclaimed / Admins chips and "View Bin" were removed —
                   the sidebar's Users list opens each of these (no double menu on the page). */}
             </div>
          </div>

          {/* v330: the table scrolls inside its box on phones (was overflow-hidden: columns were cut off) */}
          <div className="overflow-x-auto border border-gray-100 rounded-2xl">
             <table className="w-full min-w-[880px] text-left border-collapse">
                <thead>
                   <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-widest">
                      <th className="p-4 font-bold">User</th>
                      <th className="p-4 font-bold">Email & Contact</th>
                      <th className="p-4 font-bold">{['creator', 'unclaimed'].includes(activeRole) ? 'Social & Followers' : 'Role'}</th>
                      <th className="p-4 font-bold">KYC & Payouts</th>
                      <th className="p-4 font-bold">{['creator', 'unclaimed'].includes(activeRole) ? 'Niche & City' : 'Joined'}</th>
                      <th className="p-4 font-bold text-right">Action</th>
                   </tr>
                </thead>
                <tbody>
                   {filteredUsers.length > 0 ? filteredUsers.map((u, idx) => {
                      const isUnclaimed = u.is_claimed === false || u.creator_profile?.is_claimed === false || u.auth_method === 'unclaimed';
                      const cp = u.creator_profile || {};
                      const bp = u.brand_profile || {};
                      const isAgency = u.role === 'brand' && (u.is_agency === true || bp.is_agency === true); // v396: only brand accounts
                      const userPhoto = u.picture || bp.logo || u.brand_setup?.logo || cp.photo || cp.picture;
                      const userNiche = cp.primary_niche || cp.category || bp.industry || u.category || '—';
                      const userPhone = cp.phone || bp.representative_mobile || u.phone || u.mobile || '—';
                      const userFollowers = cp.followers_instagram || cp.followers || u.followers || 0;
                      const userCity = cp.city || bp.city || u.city || u.location || '—';
                      const itemKey = u.user_id ? `u-${u.user_id}` : `u-${u.id || u.email || 'idx'}-${idx}`;
                      // v375 (Ravi: "user ke name ki jagah brands ke name dikhne chahiye"): a brand row shows the company name,
                      // the person who signed up goes underneath.
                      const isBrandRow = u.role === 'brand' && !(isUnclaimed || initialRole === 'unclaimed');
                      const setup = u.brand_setup || {};
                      const brandName = String(bp.company_name || setup.company_name || '').trim();
                      const setupOpen = isBrandRow && !String(bp.company_name || '').trim();
                      const displayName = (isUnclaimed || initialRole === 'unclaimed') ? (cp.name || u.name || "Unnamed Creator")
                        : isBrandRow ? (brandName || u.name || (isAgency ? "Unnamed Agency" : "Unnamed Brand"))
                        : (u.name || bp.company_name || (u.role === 'brand' ? (isAgency ? "Unnamed Agency" : "Unnamed Brand") : "Unnamed Creator"));
                      const personLine = isBrandRow && brandName && u.name && u.name.trim().toLowerCase() !== brandName.toLowerCase() ? u.name : '';

                      return (
                       <tr 
                         key={itemKey} 
                         onClick={() => setActiveEnforcementUser(u)} 
                         className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors group"
                       >
                          <td className="p-4">
                             <div className="flex items-center gap-3">
                                {userPhoto ? <img src={userPhoto} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} className="w-9 h-9 rounded-full object-cover shadow-sm bg-[#E9D5FF] shrink-0"/> : <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#D8B4FE] to-[#A855F7] flex items-center justify-center text-sm font-extrabold text-white">{(displayName || "?").charAt(0)}</div>}
                                <div>
                                  <div className="text-sm font-extrabold text-gray-900 group-hover:text-[#A855F7] transition-colors">{displayName}</div>
                                  {personLine && <div className="text-xs text-gray-500 font-medium">by {personLine}</div>}
                                  {setupOpen && <div className="text-[10px] px-1.5 py-0.5 mt-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200 font-bold uppercase tracking-widest inline-block mr-1">Setup not finished</div>}
                                  {u.role === 'creator' && !u.is_deleted && (() => { const st = STATUS_STYLE[profileStatusOf(u)]; return (
                                    <div className={`text-[11px] px-1.5 py-0.5 mt-0.5 rounded border font-bold inline-flex items-center gap-1 mr-1 ${st.cls}`} title={st.hint} data-testid="creator-live-status">
                                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} />{st.label}
                                    </div>
                                  ); })()}{/* v396 (Ravi): one status for every creator, same words as Waitlist */}
                                  {isAgency && <div className="text-[10px] px-1.5 py-0.5 mt-0.5 rounded bg-purple-100 text-purple-800 border border-purple-300 font-bold uppercase tracking-widest inline-block mr-1">Agency</div>}
                                  {isUnclaimed && <div className="text-[10px] px-1.5 py-0.5 mt-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 font-bold uppercase tracking-widest inline-block mr-1">Unclaimed Profile</div>}
                                  {u.is_deleted && <div className="text-[10px] px-1.5 py-0.5 mt-0.5 rounded bg-red-100 text-red-600 border border-red-200 font-bold uppercase tracking-widest inline-block mr-1">Deleted</div>}
                                  {u.banned && !u.is_deleted && <div className="text-[10px] px-1.5 py-0.5 mt-0.5 rounded bg-red-100 text-red-600 border border-red-200 font-bold uppercase tracking-widest inline-block mr-1">Banned</div>}
                                  {(cp.hidden_from_explore === true) && !u.is_deleted && <div className="text-[10px] px-1.5 py-0.5 mt-0.5 rounded bg-gray-100 text-gray-700 border border-gray-300 font-bold uppercase tracking-widest inline-block mr-1">Hidden from Explore</div>}{/* v349 */}
                                  {u.suspended && <div className="text-[10px] px-1.5 py-0.5 mt-0.5 rounded bg-orange-100 text-orange-600 border border-orange-200 font-bold uppercase tracking-widest inline-block mr-1">Suspended</div>}
                                  {(u.is_restricted || u.is_suspended) && !u.banned && !u.is_deleted && !u.suspended && (
                                    <div className="text-[10px] px-1.5 py-0.5 mt-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 font-bold uppercase tracking-widest inline-block">Chat Restricted</div>
                                  )}
                                </div>
                             </div>
                          </td>
                          <td className="p-4">
                            <div className="text-sm font-semibold text-gray-900">{u.email}</div>
                            {userPhone && userPhone !== '—' && <div className="text-xs text-gray-500 font-medium">{userPhone}</div>}
                          </td>
                          <td className="p-4">
                             {/* Session 22: this column used to show the brand's INDUSTRY ("Fashion", "Travel")
                                 where the role belongs, and the header followed the page prop instead of the
                                 selected filter. Now: the role is always the first line, the category second. */}
                             {['creator', 'unclaimed'].includes(activeRole) ? (
                               <div>
                                 {(cp.instagram_handle || cp.instagram) ? (
                                    <a href={`https://instagram.com/${(cp.instagram_handle || cp.instagram).replace('@', '')}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-sm font-bold text-[#A855F7] hover:underline flex items-center gap-1">
                                      @{cp.instagram_handle || cp.instagram}
                                    </a>
                                 ) : <div className="text-sm text-gray-500 font-medium">No Instagram</div>}
                                 <div className="text-xs text-gray-600 font-medium mt-0.5">{(Number(userFollowers) || 0).toLocaleString('en-IN')}{/* v330: en-IN, no NaN */} followers</div>
                               </div>
                             ) : (() => {
                               const r = String(u.role || '').toLowerCase();
                               const isSub = u.team_role === 'sub_admin' || r === 'sub_admin';
                               const label = r === 'admin' ? 'Admin' : isSub ? 'Sub-Admin' : r === 'brand' ? (isAgency ? 'Agency' : 'Brand') : r === 'creator' ? (isUnclaimed ? 'Creator (unclaimed)' : 'Creator') : '';
                               const tone = r === 'admin' || isSub ? 'bg-violet-50 text-violet-700 border-violet-100' : r === 'brand' ? 'bg-sky-50 text-sky-700 border-sky-100' : r === 'creator' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100';
                               const detail = r === 'brand' ? (bp.industry || bp.category || '') : r === 'creator' ? (cp.primary_niche || cp.category || '') : '';
                               return (
                                 <div>
                                   <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${tone}`}>
                                     {label || 'Role missing'}
                                   </span>
                                   {detail && <div className="text-xs text-gray-500 font-medium mt-1">{detail}</div>}
                                 </div>
                               );
                             })()}
                          </td>
                          <td className="p-4">
                              <div className="space-y-1">
                                {(() => {
                                  const status = (u.kyc_status || (u.kyc_verified ? 'APPROVED' : 'NOT_SUBMITTED')).toUpperCase();
                                  if (status === 'APPROVED') {
                                    return (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100">
                                        <CheckCircle2 size={11} className="text-emerald-500" /> KYC Verified
                                      </span>
                                    );
                                  }
                                  if (status === 'PENDING') {
                                    return (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-100">
                                        <Clock size={11} className="text-amber-500" /> KYC Pending
                                      </span>
                                    );
                                  }
                                  if (status === 'REJECTED') {
                                    return (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600 border border-red-100">
                                        <XCircle size={11} className="text-red-500" /> KYC Rejected
                                      </span>
                                    );
                                  }
                                  return (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-500">
                                      No KYC
                                    </span>
                                  );
                                })()}

                                {(u.payment_info?.upi_id || u.payment_info?.bank_account_no || cp.upi_id || cp.bank_account_no || bp.upi_id || bp.bank_account_no) && (
                                  <div className="flex items-center gap-1 text-[10px] font-bold text-purple-700">
                                    <CreditCard size={11} />
                                    <span>Payout Linked</span>
                                  </div>
                                )}
                              </div>
                          </td>
                          <td className="p-4 text-xs font-semibold text-gray-500">
                             {['creator', 'unclaimed'].includes(activeRole) ? (
                               <div>
                                 <div className="text-sm font-bold text-gray-800">{userNiche}</div>
                                 <div className="text-xs text-gray-500 font-medium">{userCity}</div>
                               </div>
                             ) : (
                               u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : "—" /* v330: IST, en-IN */
                             )}
                          </td>
                          <td className="p-4 text-right">
                             <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                                {u.role === "creator" && !isUnclaimed && !u.is_deleted && profileStatusOf(u) === "waiting" && (
                                  // v396 (Ravi): approve / reject happens in ONE place — the Waitlist
                                  <button type="button" data-testid="review-in-waitlist"
                                    onClick={() => navigate(`/admin?tab=waitlist&q=${encodeURIComponent(u.email || u.creator_profile?.instagram_handle || u.name || '')}`)}
                                    className="px-2.5 py-2 rounded-xl bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 transition-colors cursor-pointer text-xs font-bold whitespace-nowrap">
                                    Review in Waitlist
                                  </button>
                                )}
                                {(u.role === "creator" || isUnclaimed) && (
                                  <button 
                                    onClick={() => setEditingCreator(u)}
                                    className="p-2 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors cursor-pointer" 
                                    title="Edit Creator Profile"
                                    aria-label="Edit creator profile" /* v330 */
                                  >
                                    <Pencil size={15} />
                                  </button>
                                )}

                                {u.is_deleted && (
                                  <button
                                    onClick={() => handleRestore(u)}
                                    disabled={restoringId === (u.user_id || u.id)}
                                    className="px-2.5 py-2 rounded-xl bg-green-50 text-green-700 hover:bg-green-100 transition-colors cursor-pointer text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                                    title="Restore from bin"
                                  >
                                    <RotateCcw size={14} /> Restore
                                  </button>
                                )}

                                {/* v288 (Ravi): full admins can bin / wipe other admin + sub-admin accounts (never themselves). */}
                                {isFullAdmin && !u.is_deleted && (u.role === "admin" || u.role === "sub_admin" || u.team_role === "sub_admin") && String(u.user_id) !== String(currentUser?.user_id) && (
                                  <button
                                    onClick={() => handleRemoveCreator(u)}
                                    data-testid="admin-row-delete"
                                    className="p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-colors cursor-pointer"
                                    title="Delete / wipe this admin account"
                                    aria-label="Delete or wipe this admin account" /* v330 */
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                )}

                                {u.role !== "admin" && !isUnclaimed && (
                                  <button 
                                    onClick={() => ban(u.user_id, u.banned)} 
                                    className="p-2 rounded-xl bg-gray-50 text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer" 
                                    title={u.banned ? "Unban" : "Ban"}
                                    aria-label={u.banned ? "Unban user" : "Ban user"} /* v330 */
                                  >
                                    <Ban size={15} />
                                  </button>
                                )}
                              </div>
                          </td>
                       </tr>
                      );
                   }) : loading ? (
                      <tr>{/* v330: loading / failed load no longer read "No users found." */}
                        <td colSpan={6} className="p-8 text-center text-gray-500 font-bold text-sm">Loading users…</td>
                      </tr>
                   ) : loadError ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-red-600 font-bold text-sm">
                          Could not load users. <button type="button" onClick={() => load && load()} className="underline cursor-pointer">Try again</button>
                        </td>
                      </tr>
                   ) : (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-gray-500 font-bold text-sm">{showCreatorFilters && roleUsers.length > 0 ? "No creators match these filters." : "No users found."}{/* v396 */}</td>
                      </tr>
                   )}
                </tbody>
             </table>
          </div>
       </div>

       {editingCreator && (
         <CreatorProfileEditModal 
           creator={editingCreator} 
           onClose={() => setEditingCreator(null)} 
           onSaveSuccess={load} 
         />
       )}

       <Presence>{showCreateModal && (
         <PopupBackdrop className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
           <PopupPanel kind="modal" className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl relative max-h-[90dvh] overflow-y-auto">{/* v330: scrolls on short phones */}
             <button onClick={() => setShowCreateModal(false)} aria-label="Close" className="absolute top-4 right-4 text-gray-500 hover:text-gray-900 transition-colors">
               <X size={20} />
             </button>
             <h3 className="text-xl font-extrabold text-gray-900 mb-2">Create New User</h3>
             <p className="text-sm font-medium text-gray-500 mb-6">Provision a new account with specific access roles.</p>
             
             <form onSubmit={handleCreateAdmin} className="space-y-4">
               <div>
                 <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Email Address</label>
                 <input type="email" required value={newEmail} onChange={e => setNewEmail(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-[16px] sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#A855F7] focus:bg-white transition-all" placeholder="admin@ybex.io" />
               </div>
               <div>
                 <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Password</label>
                 <input type="text" required value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-[16px] sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#A855F7] focus:bg-white transition-all" placeholder="Enter secure password" />
                 <p className="mt-1 text-[11px] text-gray-500">At least 10 characters, with letters and numbers. Simple ones like 123456789 are refused.</p>
               </div>
               
               {['admin', 'admins', 'sub_admins'].includes(activeRole) ? ( /* v332: role=admins / sub_admins showed a Creator/Brand picker but still sent "admin" */
                 <>
                   <div>
                     <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">System Role</label>
                     <select disabled value="admin" className="w-full px-4 py-3 bg-gray-100 border border-gray-200 rounded-xl text-sm font-semibold text-gray-500 focus:outline-none cursor-not-allowed">
                       <option value="admin">Admin</option>
                     </select>
                   </div>
                   <div>
                     <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Team Role</label>
                     <select value={newTeamRole} onChange={e => setNewTeamRole(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-[16px] sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#A855F7] focus:bg-white transition-all">
                       <option value="sub_admin">Sub-Admin (Limited Access)</option>
                       <option value="admin">Super Admin (Full Access)</option>
                     </select>
                   </div>
                   
                   {newTeamRole === 'sub_admin' && (
                     <div className="pt-2">
                       <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 block">Sub-Admin Permissions</label>
                       <div className="max-h-72 overflow-y-auto pr-2 custom-scrollbar">
                         <SubAdminPermissionPicker permissions={newPermissions} onChange={setNewPermissions} />
                       </div>
                     </div>
                   )}
                 </>
               ) : (
                 <div>
                   <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">System Role</label>
                   <select value={newRole} onChange={e => setNewRole(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-[16px] sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#A855F7] focus:bg-white transition-all">
                     <option value="creator">Creator</option>
                     <option value="brand">Brand</option>
                   </select>
                 </div>
               )}

               <div className="pt-4 flex gap-3">
                 <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-extrabold text-sm rounded-xl transition-colors">
                   Cancel
                 </button>
                 <button type="submit" disabled={creating} className="flex-1 py-3 px-4 bg-gray-900 hover:bg-black text-white font-extrabold text-sm rounded-xl transition-colors disabled:opacity-50">
                   {creating ? 'Creating...' : 'Create Account'}
                 </button>
               </div>
             </form>
           </PopupPanel>
         </PopupBackdrop>
       )}</Presence>
    </div>
  );
}
