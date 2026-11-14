import React, { useState, useEffect } from 'react';
import { Search, Filter, Activity, Clock, Shield, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';

export default function AdminActivityLogsTab() {
  const [subTab, setSubTab] = useState('activity_logs'); // activity_logs, auth_logs
  const [activityLogs, setActivityLogs] = useState([]);
  const [authLogs, setAuthLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState('all');
  const [loadError, setLoadError] = useState(false); // v330: failed load is not "No matching logs"
  // v330: IST, en-IN, and no "Invalid Date"
  const fmtTs = (d) => { const t = d ? new Date(d) : null; return t && !isNaN(t) ? t.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '—'; };

  const fetchLogs = async () => {
    setLoading(true);
    setLoadError(false); // v330
    try {
      if (subTab === 'activity_logs') {
        const res = await api.get("admin/logs/activity");
        setActivityLogs(res.data || []);
      } else {
        const res = await api.get("admin/logs/auth");
        setAuthLogs(res.data || []);
      }
    } catch (e) {
      console.error(`Failed to fetch ${subTab}:`, e);
      setLoadError(true); // v330
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [subTab]);

  const filteredActivityLogs = (activityLogs || []).filter(log => {
    const matchesSearch = 
      (log.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.action || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.target_type || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      JSON.stringify(log.detail || log.details || {}).toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesSearch) return false;
    if (filterAction === 'all') return true;
    return log.action === filterAction;
  });

  const filteredAuthLogs = (authLogs || []).filter(log => {
    return (log.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
           (log.event_type || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
           (log.ip_address || '').toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Get unique actions for filter dropdown in activity logs
  const uniqueActions = ['all', ...new Set((activityLogs || []).map(l => l.action).filter(Boolean))];

  return (
    <div className="space-y-6 font-sans w-full animate-in fade-in duration-200">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">System Audit Logs</h2>
          <p className="text-sm text-gray-500 font-medium mt-1">Audit trail of all administrative actions and authentication attempts.</p>
        </div>
        <button 
          onClick={fetchLogs} 
          disabled={loading}
          className="px-4 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 font-bold rounded-xl text-xs uppercase tracking-widest flex items-center gap-2 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-200">
        <button 
          onClick={() => { setSubTab('activity_logs'); setSearchQuery(''); setFilterAction('all'); }} /* v332: an old action filter left the list empty */
          className={`pb-3 px-2 text-sm font-extrabold transition-colors border-b-2 flex items-center gap-2 cursor-pointer ${subTab === 'activity_logs' ? 'border-[#A855F7] text-[#A855F7]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          <Activity size={16} /> Activity Audit
        </button>
        <button 
          onClick={() => { setSubTab('auth_logs'); setSearchQuery(''); }} 
          className={`pb-3 px-2 text-sm font-extrabold transition-colors border-b-2 flex items-center gap-2 cursor-pointer ${subTab === 'auth_logs' ? 'border-[#A855F7] text-[#A855F7]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          <Shield size={16} /> Auth Audit
        </button>
      </div>

      <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input 
              type="text" 
              placeholder={subTab === 'activity_logs' ? "Search audit trail..." : "Search login logs by email or IP..."}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              // v330: 16px on phones so iOS doesn't zoom
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-[16px] sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#E9D5FF] focus:border-[#C084FC]"
            />
          </div>
          
          {subTab === 'activity_logs' && (
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-gray-500" />
              <select
                value={filterAction}
                onChange={e => setFilterAction(e.target.value)}
                aria-label="Filter by action" /* v332 */
                className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-[16px] sm:text-xs font-bold uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-[#E9D5FF] focus:border-[#C084FC]"
              >
                {uniqueActions.map(act => (
                  <option key={act} value={act}>
                    {act === 'all' ? 'All Actions' : act.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500 font-bold">Loading audit logs...</div>
        ) : loadError ? (
          /* v330: failed load shown as an error with retry, not as "No matching logs found" */
          <div className="p-12 text-center text-red-600 font-bold text-sm">
            Could not load logs. <button type="button" onClick={fetchLogs} className="underline cursor-pointer">Try again</button>
          </div>
        ) : subTab === 'activity_logs' ? (
          <div className="overflow-x-auto border border-gray-100 rounded-2xl">{/* v330: scroll inside the box on phones */}
            <table className="w-full min-w-[760px] text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-widest">
                  <th className="p-4 font-bold">Timestamp</th>
                  <th className="p-4 font-bold">Admin</th>
                  <th className="p-4 font-bold">Action</th>
                  <th className="p-4 font-bold">Target</th>
                  <th className="p-4 font-bold">Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredActivityLogs.length > 0 ? filteredActivityLogs.map((log) => {
                  const detailsObj = log.detail || log.details || {};
                  const detailsStr = typeof detailsObj === 'string' ? detailsObj : JSON.stringify(detailsObj);
                  
                  return (
                    <tr key={log.id || Math.random()} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="p-4 text-xs font-semibold text-gray-500 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock size={12} className="text-gray-500" />
                          {fmtTs(log.created_at)}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm font-extrabold text-gray-900">{log.email || 'System'}</div>
                        {(log.user_id || log.admin_id) && <div className="text-[10px] text-gray-500 font-mono">ID: {log.user_id || log.admin_id}</div>}{/* v330: no "ID: undefined" */}
                      </td>
                      <td className="p-4">
                        <span className="px-2 py-1 rounded-lg bg-[#F3E8FF] text-[#7E22CE] text-[10px] font-extrabold uppercase tracking-widest border border-[#E9D5FF]">
                          {String(log.action || 'action').replace(/_/g, ' ')}{/* v332: empty pill when no action */}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="text-xs font-extrabold text-gray-700 capitalize">{log.target_type || '—'}</div>
                        {log.target_id && (
                          <div className="text-[10px] font-semibold text-gray-500 font-mono">
                            {String(log.target_id).length > 12 ? `${String(log.target_id).substring(0, 12)}...` : String(log.target_id)}{/* v332: numeric ids */}
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-xs font-medium text-gray-500 max-w-xs md:max-w-md break-all">
                        <code className="bg-gray-50 px-2 py-1.5 rounded-lg border border-gray-100 font-mono text-[10px] block overflow-x-auto max-h-16">
                          {detailsStr}
                        </code>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-gray-500 font-bold text-sm">
                      No matching activity logs found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-100 rounded-2xl">{/* v330: scroll inside the box on phones */}
            <table className="w-full min-w-[560px] text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-widest">
                  <th className="p-4 font-bold">Timestamp</th>
                  <th className="p-4 font-bold">Admin</th>
                  <th className="p-4 font-bold">Event</th>
                  <th className="p-4 font-bold">IP Address</th>
                </tr>
              </thead>
              <tbody>
                {filteredAuthLogs.length > 0 ? filteredAuthLogs.map((log) => (
                  <tr key={log.id || Math.random()} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="p-4 text-xs font-semibold text-gray-500 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock size={12} className="text-gray-500" />
                        {fmtTs(log.created_at)}
                      </div>
                    </td>
                    <td className="p-4 text-sm font-extrabold text-gray-700">{log.email || '—'}</td>{/* v332: no blank cells */}
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-widest ${log.event_type === 'login' ? 'bg-green-100 text-green-700' : log.event_type === 'failed_login' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                        {String(log.event_type || 'event').replace(/_/g, ' ')}{/* v330: no crash on a row without event_type */}
                      </span>
                    </td>
                    <td className="p-4 text-xs font-medium text-gray-500">{log.ip_address || '—'}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="p-12 text-center text-gray-500 font-bold text-sm">
                      No matching auth logs found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
