import React, { useState, useEffect } from 'react';
import { formatAmount } from "../../utils/safeFormat";
import { Lightbulb, Users, Megaphone, Activity, Briefcase, UserPlus, ShieldCheck, AlertTriangle, HelpCircle, Landmark, Wallet, PercentCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { api } from '../../lib/api';
import { toast } from 'sonner';
import useGrowthReport from './growth/useGrowthReport';
import { Answers, Pulse, Alerts, RefreshButton } from './growth/Briefing';
import WherePanel from './growth/WherePanel';
import PeoplePanel from './growth/PeoplePanel';
import FunnelPanel from './growth/FunnelPanel';
import MoneyPanel from './growth/MoneyPanel';
import GrowPanel from './growth/GrowPanel';
import { Shimmer } from '../common/ContentSkeletons';

// Session 46: tabs of the Growth Command Center. Anything else a card links to (payouts, KYC…)
// is another admin page and goes through onNavigate.
const GROWTH_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'where', label: 'Where to advertise' },
  { key: 'people', label: 'People' },
  { key: 'funnel', label: 'Deal funnel' },
  { key: 'money', label: 'Money' },
  { key: 'grow', label: 'Growth ideas' },
];

export default function AdminAnalytics({ onNavigate }) {
  const [stats, setStats] = useState({ 
     users: 0,
     creators: 0,
     brands: 0,
     campaigns: 0,
     live_campaigns: 0,
     collabs: 0
  });
  
  const [chartData, setChartData] = useState({
     revenue: [],
     users: []
  });

  const [todoStats, setTodoStats] = useState({
     kycPending: 0,
     waitlistPending: 0,
     campaignApprovals: 0,
     reportsPending: 0,
     ugcPending: 0,
     ticketsPending: 0,
     pitchesPending: 0,
     payoutRequests: 0,
     ugcRefunds: 0,
     referralWithdrawals: 0,
     totalTasks: 0
  });

  const [financeStats, setFinanceStats] = useState({
     liveValue: 0,
     escrowSecured: 0,
     commission: 0,
     liveCount: 0
  });

  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState(false); // v332: a failed load showed all zeros and "Clear" as if real
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState('overview');
  const growth = useGrowthReport();
  const goTab = (t) => {
    if (GROWTH_TABS.some((x) => x.key === t)) { setTab(t); if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' }); }
    else if (onNavigate) onNavigate(t);
  };
  const [days, setDays] = useState(7);
  const [chartLoading, setChartLoading] = useState(false);

  useEffect(() => {
     const fetchData = async () => {
       setStatsError(false); // v332
       try {
         // v419 (admin cleanup): the Overview downloaded 7 full lists (KYC, waitlist, campaigns, reports, UGC,
         // pitches, tickets) only to count them. One small counts call answers all of it.
         const [statsRes, countsRes] = await Promise.all([
           api.get("admin/stats"),
           api.get("admin/pending-counts").catch(() => ({ data: {} }))
         ]);

         if (statsRes.data) {
           setStats(prev => ({...prev, ...statsRes.data}));
           setFinanceStats({
             liveValue: statsRes.data.liveValue || 0,
             escrowSecured: statsRes.data.escrowSecured || 0,
             commission: statsRes.data.platformRevenue || 0,
             liveCount: statsRes.data.live_campaigns || 0
           });
         }

         const counts = countsRes?.data || {};
         const kycPending = Number(counts.kyc) || 0;
         const waitlistPending = Number(counts.waitlist) || 0;
         const campaignApprovals = Number(counts.campaigns) || 0;
         const reportsPending = Number(counts.reports) || 0;
         const ugcPending = Number(counts.ugc_active) || 0;
         const ticketsPending = Number(counts.helpdesk) || 0;
         const pitchesPending = Number(counts.pitches) || 0;
         const payoutRequests = Number(counts.payout_requests) || 0;
         const ugcRefunds = Number(counts.ugc_refunds) || 0;
         const referralWithdrawals = Number(counts.referral_withdrawals) || 0;

         setTodoStats({
           kycPending,
           waitlistPending,
           campaignApprovals,
           reportsPending,
           ugcPending,
           ticketsPending,
           pitchesPending,
           payoutRequests,
           ugcRefunds,
           referralWithdrawals,
           totalTasks: kycPending + waitlistPending + campaignApprovals + reportsPending + ugcPending + ticketsPending + pitchesPending + payoutRequests + ugcRefunds + referralWithdrawals
         });

         // Financial metrics are now calculated on the backend

       } catch (error) {
         console.error("Error fetching analytics data:", error);
         setStatsError(true); // v332
       } finally {
         setLoading(false);
       }
     };
     
     fetchData();
  }, [reloadKey]); // v332: Try again re-runs the load

  useEffect(() => {
    const fetchChartData = async () => {
      setChartLoading(true);
      try {
        const chartRes = await api.get(`/admin/chart-data?days=${days}`);
        if (chartRes.data) {
          setChartData({
            revenue: chartRes.data.revenue || [],
            users: chartRes.data.users || []
          });
        }
      } catch (error) {
        console.error("Error fetching chart data:", error);
      } finally {
        setChartLoading(false);
      }
    };

    fetchChartData();
  }, [days]);

  const formatNumber = (num) => {
    if (num == null) return "0";
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toLocaleString('en-IN'); // v330: Indian grouping
  };

  const totalUsers = (stats.creators || 0) + (stats.brands || 0) || 1;
  const creatorPct = Math.round(((stats.creators || 0) / totalUsers) * 100);
  const brandPct = 100 - creatorPct;

  if (loading) {
    return <div className="p-8 text-center text-gray-500 font-medium">Loading analytics...</div>;
  }

  return (
    <div className="space-y-8 w-full pb-12 font-sans">
       
       <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-2">
         <div>
           <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">Growth Command Center</h2>
           <p className="text-sm text-gray-500 font-medium mt-1">Where money comes from, where to advertise, and where people get stuck — from your live data.</p>
         </div>
         <RefreshButton loading={growth.loading} onClick={growth.reload} updatedAt={growth.data?.generatedAt} />
       </div>

       {growth.loading && !growth.data && (
         <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading growth numbers">
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-4"><Shimmer className="h-32" /><Shimmer className="h-32" /><Shimmer className="h-32" /></div>
           <Shimmer className="h-40" />
         </div>
       )}
       {growth.error && (
         <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
           <span>{growth.error} The numbers below this box still work.</span>
           <button type="button" onClick={growth.reload} className="text-xs font-extrabold underline min-h-[32px] text-left">Try again</button>
         </div>
       )}
       {growth.data && (
         <>
           <Answers report={growth.data} goTab={goTab} />
           <Alerts insights={growth.data.insights} goTab={goTab} />
         </>
       )}

       <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Overview sections">
         {GROWTH_TABS.map((t) => (
           <button
             key={t.key}
             type="button"
             role="tab"
             aria-selected={tab === t.key}
             onClick={() => setTab(t.key)}
             className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold min-h-[40px] border transition-colors ${tab === t.key ? 'bg-[#7E22CE] text-white border-[#7E22CE]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
           >
             {t.label}
           </button>
         ))}
       </div>

       {tab !== 'overview' && !growth.data && !growth.loading && (
         <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm font-medium text-gray-600">This section needs the growth numbers, which could not be loaded. Use Refresh to try again.</div>
       )}
       {tab === 'where' && growth.data && <WherePanel report={growth.data} />}
       {tab === 'people' && growth.data && <PeoplePanel report={growth.data} onReminderSent={growth.reload} />}
       {tab === 'funnel' && growth.data && <FunnelPanel report={growth.data} />}
       {tab === 'money' && growth.data && <MoneyPanel report={growth.data} onNavigate={onNavigate} />}
       {tab === 'grow' && growth.data && <GrowPanel report={growth.data} />}

       {tab === 'overview' && (
       <div className="space-y-8">
       {statsError && ( /* v332 */
         <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
           <span>Couldn't load the platform numbers, so the counts below may show 0.</span>
           <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="text-xs font-extrabold underline min-h-[32px] text-left">Try again</button>
         </div>
       )}
       {growth.data && <Pulse report={growth.data} />}

       {/* Top Stat Cards */}
       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard title="Total Creators" value={formatNumber(stats.creators)} icon={<Users size={22} className="text-[#A855F7]" />} />
          <StatCard title="Total Brands" value={formatNumber(stats.brands)} icon={<Briefcase size={22} className="text-[#A855F7]" />} />
          <StatCard title="Total Campaigns" value={formatNumber(stats.campaigns)} icon={<Megaphone size={22} className="text-[#A855F7]" />} />
          <StatCard title="Total Users" value={formatNumber(stats.users)} icon={<UserPlus size={22} className="text-[#A855F7]" />} />
       </div>

        {/* Visual Treasury Ledger Highlight Panel */}
        <div className="space-y-4">
           <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                 <span className="text-[10px] font-black tracking-widest text-[#A855F7] uppercase bg-[#FAF5FF] border border-[#F3E8FF] px-2.5 py-1 rounded-lg">Financial Ledger</span>
                 <h3 className="text-xl font-extrabold text-gray-900 tracking-tight mt-1.5">Ybex Platform Treasury & Escrow Status</h3>
              </div>

           </div>

           <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Metric 1 */}
              <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm flex items-center gap-4 hover:shadow-md transition-all duration-200">
                 <div className="w-14 h-14 rounded-2xl bg-[#F5F0FF] flex items-center justify-center shrink-0">
                    <Wallet size={24} className="text-[#A855F7]" />
                 </div>
                 <div>
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Live Campaigns Budget</div>
                    <div className="font-extrabold text-2xl text-gray-900">₹{formatAmount(financeStats.liveValue)}</div>
                    <p className="text-[10px] text-gray-500 font-semibold mt-1">Active allocated brand budgets across {financeStats.liveCount} campaign{Number(financeStats.liveCount) === 1 ? '' : 's'}</p>{/* v332: no "campaign(s)" */}
                 </div>
              </div>

              {/* Metric 2 */}
              <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm flex items-center gap-4 hover:shadow-md transition-all duration-200">
                 <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center shrink-0">
                    <ShieldCheck size={24} className="text-emerald-500" />
                 </div>
                 <div>
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Secured Escrow Balance</div>
                    <div className="font-extrabold text-2xl text-[#027A48]">₹{formatAmount(financeStats.escrowSecured)}</div>
                    <p className="text-[10px] text-gray-500 font-semibold mt-1">Paid in by brands and not yet released or refunded</p>
                 </div>
              </div>

              {/* Metric 3 */}
              <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm flex items-center gap-4 hover:shadow-md transition-all duration-200">
                 <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center shrink-0">
                    <PercentCircle size={24} className="text-amber-500" />
                 </div>
                 <div>
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Platform Fees</div>
                    <div className="font-extrabold text-2xl text-gray-900">₹{formatAmount(financeStats.commission)}</div>
                    <p className="text-[10px] text-gray-500 font-semibold mt-1">Sum of platform fees recorded on payments</p>
                 </div>
              </div>
           </div>
        </div>

       {/* Administrative Action Center (Attention Required Queue) */}
       <div className="bg-white border border-gray-100 rounded-3xl p-7 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
             <div>
                <h3 className="text-xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
                   <span className="relative flex h-3 w-3">
                      {todoStats.totalTasks > 0 && (
                         <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                      )}
                      <span className={`relative inline-flex rounded-full h-3 w-3 ${todoStats.totalTasks > 0 ? "bg-rose-500" : "bg-emerald-50"}`}></span>
                   </span>
                   Attention Required Hub
                </h3>
                <p className="text-xs text-gray-500 font-medium mt-1">
                   Real-time compliance checks, moderation queues, and operational approvals.
                </p>
             </div>
             <div className="px-3.5 py-1.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold text-gray-600 flex items-center gap-2">
                <span>Total Actions Pending:</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${todoStats.totalTasks > 0 ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"}`}>
                   {todoStats.totalTasks}
                </span>
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
             {/* Session 38: money waiting for an admin — first, because people are waiting to be paid. */}
             <ActionCard 
                title="Creator Payout Requests"
                count={todoStats.payoutRequests}
                description="Creators asked to be paid. Check UPI / bank and mark paid with the UTR."
                icon={<Wallet size={20} className="text-[#16A34A]" />}
                bgColor="bg-green-50/40 hover:bg-green-50/80 border border-green-100/70"
                badgeColor="bg-green-100 text-green-700"
                onClick={() => onNavigate && onNavigate("escrow&view=requests")}
             />

             <ActionCard 
                title="UGC Refunds to Send"
                count={todoStats.ugcRefunds}
                description="Brand refunds waiting to be sent by hand (cancelled or expired UGC orders)."
                icon={<Landmark size={20} className="text-[#0EA5E9]" />}
                bgColor="bg-sky-50/40 hover:bg-sky-50/80 border border-sky-100/70"
                badgeColor="bg-sky-100 text-sky-700"
                onClick={() => onNavigate && onNavigate("escrow&view=ugc_refunds")}
             />

             <ActionCard 
                title="Referral Withdrawals"
                count={todoStats.referralWithdrawals}
                description="Creators withdrawing referral rewards. Pay and add the UTR, or reject."
                icon={<PercentCircle size={20} className="text-[#D946EF]" />}
                bgColor="bg-fuchsia-50/40 hover:bg-fuchsia-50/80 border border-fuchsia-100/70"
                badgeColor="bg-fuchsia-100 text-fuchsia-700"
                onClick={() => onNavigate && onNavigate("settings&view=referrals")}
             />

             {/* Card 1: KYC Checks */}
             <ActionCard 
                title="KYC Document Reviews"
                count={todoStats.kycPending}
                description="Verify creator & brand government IDs and tax registrations."
                icon={<ShieldCheck size={20} className="text-[#3B82F6]" />}
                bgColor="bg-blue-50/40 hover:bg-blue-50/80 border border-blue-100/70"
                badgeColor="bg-blue-100 text-blue-700"
                onClick={() => onNavigate && onNavigate("verifications")}
             />

             {/* Card 2: Waitlist Applications */}
             <ActionCard 
                title="Waitlist Registrations"
                count={todoStats.waitlistPending}
                description="Review pending user signups and authorize onboarding invite codes."
                icon={<UserPlus size={20} className="text-[#A855F7]" />}
                bgColor="bg-purple-50/40 hover:bg-purple-50/80 border border-purple-100/70"
                badgeColor="bg-purple-100 text-purple-700"
                onClick={() => onNavigate && onNavigate("waitlist")}
             />

             {/* Card 3: Campaign Approvals */}
             <ActionCard 
                title="Campaign Brief Audits"
                count={todoStats.campaignApprovals}
                description="Approve or reject brand-submitted campaign briefs before launch."
                icon={<Megaphone size={20} className="text-[#F59E0B]" />}
                bgColor="bg-amber-50/40 hover:bg-amber-50/80 border border-amber-100/70"
                badgeColor="bg-amber-100 text-amber-800"
                onClick={() => onNavigate && onNavigate("campaigns")}
             />

             {/* Pitch Leads & Concierge */}
             <ActionCard 
                title="Campaign Pitch Leads"
                count={todoStats.pitchesPending}
                description="Monitor brand pitches to creators, concierge brokers, and unregistered leads."
                icon={<Lightbulb size={20} className="text-[#8B5CF6]" />}
                bgColor="bg-purple-50/40 hover:bg-purple-50/80 border border-purple-100/70"
                badgeColor="bg-purple-100 text-purple-700"
                onClick={() => onNavigate && onNavigate("pitches")}
             />

             {/* Card 4: System Abuse & Reports */}
             <ActionCard 
                title="System Abuse & Disputes"
                count={todoStats.reportsPending}
                description="Analyze flagged user content and resolve escrow milestone disagreements."
                icon={<AlertTriangle size={20} className="text-[#EF4444]" />}
                bgColor="bg-red-50/40 hover:bg-red-50/80 border border-red-100/70"
                badgeColor="bg-red-100 text-red-700"
                onClick={() => onNavigate && onNavigate("reports")}
             />

             {/* Card 5: UGC Orders Pipeline */}
             <ActionCard 
                title="Pending UGC Deliveries"
                count={todoStats.ugcPending}
                description="Track live creator UGC production orders and internal video deadlines."
                icon={<Activity size={20} className="text-[#10B981]" />}
                bgColor="bg-emerald-50/40 hover:bg-emerald-50/80 border border-emerald-100/70"
                badgeColor="bg-emerald-100 text-emerald-700"
                onClick={() => onNavigate && onNavigate("ugc-orders")}
             />

             {/* Card 6: Helpdesk Support Tickets */}
             <ActionCard 
                title="Helpdesk Support Tickets"
                count={todoStats.ticketsPending}
                description="Reply to open brand/creator disputes, queries, and system requests."
                icon={<HelpCircle size={20} className="text-[#EC4899]" />}
                bgColor="bg-pink-50/40 hover:bg-pink-50/80 border border-pink-100/70"
                badgeColor="bg-pink-100 text-pink-700"
                onClick={() => onNavigate && onNavigate("helpdesk")}
             />


          </div>
       </div>

       {/* Charts Section */}
       <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Revenue Bar Chart */}
          <div className="bg-white border border-gray-100 rounded-3xl p-7 shadow-sm">
             <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="font-extrabold text-gray-900 text-lg">Platform Revenue</h3>
                  <p className="text-xs text-gray-500 font-medium mt-1">
                    {chartLoading ? "Updating metrics..." : "Real-time transaction GMV & platform fees"}
                  </p>
                </div>
                <select 
                   value={days} 
                   onChange={(e) => setDays(Number(e.target.value))}
                   aria-label="Chart period" /* v332 */
                   className="bg-gray-50 border border-gray-200 text-gray-700 font-semibold rounded-xl px-3 py-2 text-[16px] sm:text-xs focus:outline-none focus:ring-2 focus:ring-[#E9D5FF] focus:border-[#C084FC] transition-all"
                >
                   <option value={7}>Last 7 Days</option>
                   <option value={30}>Last 30 Days</option>
                </select>
             </div>
             <div className={`relative h-[280px] w-full transition-opacity duration-200 ${chartLoading ? "opacity-40" : "opacity-100"}`}>
               {!chartLoading && chartData.revenue.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-gray-500 pointer-events-none">No payments in this period</div>}{/* v332: empty axes looked broken */}
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={chartData.revenue} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                   <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af', fontWeight: 600 }} dy={10} />
                   <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af', fontWeight: 600 }} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `₹${(v / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 })}k` : `₹${v}`)} />{/* v332: no "₹0.25k" / "₹0k" */}
                   <Tooltip 
                     cursor={{ fill: '#f9fafb' }}
                     contentStyle={{ backgroundColor: '#ffffff', borderColor: '#f3f4f6', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', padding: '12px', fontWeight: 600, fontSize: '13px', color: '#111827' }} 
                     itemStyle={{ fontWeight: 700 }}
                     formatter={(v) => [`₹${(Number(v) || 0).toLocaleString('en-IN')}`, 'GMV']} /* v332: was raw "gmv: 12345" */
                   />
                   <Bar dataKey="gmv" fill="#C084FC" radius={[6, 6, 0, 0]} maxBarSize={40} />
                 </BarChart>
               </ResponsiveContainer>
             </div>
          </div>

          {/* User Growth Area Chart */}
          <div className="bg-white border border-gray-100 rounded-3xl p-7 shadow-sm">
             <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="font-extrabold text-gray-900 text-lg">User Growth</h3>
                  <p className="text-xs text-gray-500 font-medium mt-1">
                    {chartLoading ? "Updating metrics..." : "Cumulative registered creators & brands"}
                  </p>
                </div>
             </div>
             <div className={`relative h-[280px] w-full transition-opacity duration-200 ${chartLoading ? "opacity-40" : "opacity-100"}`}>
               {!chartLoading && chartData.users.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-gray-500 pointer-events-none">No sign-ups in this period</div>}{/* v332 */}
               <ResponsiveContainer width="100%" height="100%">
                 <AreaChart data={chartData.users} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                   <defs>
                     <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                       <stop offset="5%" stopColor="#A855F7" stopOpacity={0.2}/>
                       <stop offset="95%" stopColor="#A855F7" stopOpacity={0}/>
                     </linearGradient>
                   </defs>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                   <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af', fontWeight: 600 }} dy={10} />
                   <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af', fontWeight: 600 }} />
                   <Tooltip 
                     contentStyle={{ backgroundColor: '#ffffff', borderColor: '#f3f4f6', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', padding: '12px', fontWeight: 600, fontSize: '13px', color: '#111827' }} 
                     formatter={(v) => [(Number(v) || 0).toLocaleString('en-IN'), 'Users']} /* v332: was raw "count" */
                   />
                   <Area type="monotone" dataKey="count" stroke="#A855F7" strokeWidth={3} fillOpacity={1} fill="url(#colorUsers)" />
                 </AreaChart>
               </ResponsiveContainer>
             </div>
          </div>

       </div>

       {/* Bottom Row */}
       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* User Distribution */}
          <div className="bg-white border border-gray-100 rounded-3xl p-7 shadow-sm">
             <h3 className="font-extrabold text-gray-900 text-lg mb-6">User Distribution</h3>
             <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                     <div className="flex items-center gap-2 font-bold text-gray-700 text-sm"><Users size={18} className="text-[#C084FC]"/> Creators</div>
                     <div className="font-extrabold text-gray-900 text-lg">{formatNumber(stats.creators)}</div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5">
                    <div className="bg-gradient-to-r from-[#D8B4FE] to-[#A855F7] h-2.5 rounded-full" style={{ width: `${creatorPct}%`}}></div>
                  </div>
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-2">
                     <div className="flex items-center gap-2 font-bold text-gray-700 text-sm"><Briefcase size={18} className="text-emerald-400"/> Brands</div>
                     <div className="font-extrabold text-gray-900 text-lg">{formatNumber(stats.brands)}</div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5">
                    <div className="bg-gradient-to-r from-emerald-300 to-emerald-500 h-2.5 rounded-full" style={{width: `${brandPct}%`}}></div>
                  </div>
                </div>
             </div>
          </div>

          {/* Campaign Pipeline */}
          <div className="lg:col-span-2 bg-white border border-gray-100 rounded-3xl p-7 shadow-sm flex flex-col justify-between">
             <h3 className="font-extrabold text-gray-900 text-lg mb-6 flex items-center gap-2">Campaign Pipeline</h3>
             <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
                <PipelineBox label="Total Created" value={formatNumber(stats.campaigns)} sub="All time" color="gray" />
                <PipelineBox label="Live" value={formatNumber(stats.live_campaigns)} sub="Accepting apps" color="purple" active />
                <PipelineBox label="Active Collabs" value={formatNumber(stats.collabs)} sub="In progress" color="blue" />
                <PipelineBox label="Completed" value="-" sub="Resolved" color="emerald" />
             </div>
          </div>

       </div>
       </div>
       )}
    </div>
  );
}

function StatCard({ title, value, icon }) {
   return (
      <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
         <div className="w-14 h-14 rounded-2xl bg-[#F3E8FF] flex items-center justify-center shrink-0">
           {icon}
         </div>
         <div>
           <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">{title}</div>
           <div className="font-extrabold text-3xl text-gray-900">{value}</div>
         </div>
      </div>
   );
}

function PipelineBox({ label, value, sub, active, color }) {
   const colorMap = {
     purple: 'bg-[#F3E8FF] border-[#E9D5FF] text-[#7E22CE] label-[#9333EA]',
     gray: 'bg-gray-50 border-gray-100 text-gray-800 label-gray-500',
     blue: 'bg-blue-50 border-blue-100 text-blue-800 label-blue-500',
     emerald: 'bg-emerald-50 border-emerald-100 text-emerald-800 label-emerald-500',
   };

   const theme = colorMap[color] || colorMap.gray;
   const bgBorder = theme.split(' ').slice(0, 2).join(' ');
   const valColor = theme.split(' ')[2];
   const labelColor = theme.split(' ')[3]?.replace('label-', 'text-') || 'text-gray-500';

   return (
      <div className={`p-5 rounded-2xl border flex flex-col justify-center ${bgBorder}`}>
         <div className={`text-3xl font-extrabold mb-1 ${valColor}`}>{value}</div>
         <div className={`text-sm font-bold ${labelColor}`}>{label}</div>
         <div className="text-[10px] text-gray-500 uppercase tracking-widest mt-2 font-semibold">{sub}</div>
      </div>
   );
}

function ActionCard({ title, count, description, icon, bgColor, badgeColor, onClick }) {
   const isAlerted = count > 0;
   return (
      <div 
         onClick={onClick}
         role="button" tabIndex={0} /* v332: keyboard + screen reader */
         onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick && onClick(); } }}
         className={`p-5 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between group relative overflow-hidden ${
            isAlerted 
               ? "bg-rose-50/40 border-rose-200 shadow-[0_0_12px_rgba(244,63,94,0.12)] hover:border-rose-300 animate-[pulse_3s_infinite_alternate]" 
               : bgColor
         }`}
      >
         <div className="flex items-start justify-between gap-3 mb-3">
            <div className={`p-3 bg-white border rounded-xl shadow-sm flex items-center justify-center shrink-0 ${isAlerted ? "border-rose-100" : "border-gray-100"}`}>
               {icon}
            </div>
            <div className="flex items-center gap-1.5">
               {isAlerted && (
                  <span className="relative flex h-2.5 w-2.5">
                     <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                     <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                  </span>
               )}
               <span className={`text-xs font-black px-2.5 py-1 rounded-full ${isAlerted ? badgeColor : "bg-gray-100 text-gray-500"}`}>
                  {count > 0 ? `${count} Pending` : "Clear"}
               </span>
            </div>
         </div>
         <div>
            <h4 className="font-extrabold text-gray-900 text-sm group-hover:text-indigo-600 transition-colors flex items-center gap-1.5">
               {title}
               <span className="transform translate-x-0 opacity-0 group-hover:translate-x-1 group-hover:opacity-100 transition-all text-indigo-500">→</span>
            </h4>
            <p className="text-xs text-gray-500 font-medium mt-1 leading-relaxed">{description}</p>
         </div>
      </div>
   );
}
