import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { Upload, Camera, AlertTriangle, Search, CheckCircle2, Clock, ExternalLink, ArrowLeft, FileText, Play, ShieldAlert, XCircle, ShieldCheck } from "lucide-react";
import AdminSignedContractModal from "./AdminSignedContractModal";
import VideoEmbedPreview from "../shared/VideoEmbedPreview";
import UniversalPreviewModal from "../shared/UniversalPreviewModal";


import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";

// v332: order statuses come from the server in UPPERCASE (CLAIMED, IN_PROGRESS, SUBMITTED, COMPLETED…).
// The screen compared them with lowercase "claimed" / "delivered" / "completed", so the status filter,
// the KPI counts and the overdue flag almost never matched. Group them here for display only.
const UGC_ACTIVE = ["CLAIMED", "ACCEPTED", "IN_PROGRESS", "ACTIVE", "PENDING", "REVISION_REQ", "REVISION_REQUESTED", "REVISION_DECLINED", "IN_HOUSE_ASSIGNED", "AWAITING_SIGNATURE"];
const UGC_DELIVERED = ["DELIVERED", "SUBMITTED", "DRAFT_SUBMITTED"];
const UGC_DONE = ["COMPLETED", "APPROVED", "PAID", "RELEASED"];
const ugcGroup = (o) => {
  const st = String(o?.status || "").toUpperCase();
  if (UGC_DONE.includes(st) || o?.payment_status === "RELEASED") return "completed";
  if (UGC_DELIVERED.includes(st) || o?.creator_status === "DELIVERED") return "delivered";
  if (UGC_ACTIVE.includes(st)) return "claimed";
  return st.toLowerCase();
};
const isPastDeadline = (o) => { const t = o?.internal_deadline ? new Date(o.internal_deadline) : null; return Boolean(t && !isNaN(t) && t < new Date()); };

export default function AdminUgcManager() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All"); // "All", "claimed", "delivered", "completed"
  const [riskFilter, setRiskFilter] = useState("All text"); // "All", "At Risk", "On Time"
  
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [uploadingOrder, setUploadingOrder] = useState(null);
  const [viewingContractOrder, setViewingContractOrder] = useState(null);
  const [simulatedVideoUrl, setSimulatedVideoUrl] = useState("");
  const [teamNotes, setTeamNotes] = useState("");
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewModalUrl, setPreviewModalUrl] = useState("");
  const [loadError, setLoadError] = useState(false); // v330: failed load is not "no orders"
  const [uploadingBusy, setUploadingBusy] = useState(false); // v330: no double team upload
  // v330: readable status instead of raw enums like IN_PROGRESS; IST date + time for deadlines
  const prettyStatus = (s) => (s ? String(s).replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : "—");
  const istDateTime = (d) => { const t = d ? new Date(d) : null; return t && !isNaN(t) ? t.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—"; };

  const loadData = () => {
    setLoading(true);
    setLoadError(false); // v330
    api.get("admin/ugc/orders")
      .then(res => {
        setOrders(res.data || []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error loading UGC orders:", err);
        toast.error("Failed to load UGC orders. Please refresh.");
        setOrders([]);
        setLoadError(true); // v330
        setLoading(false);
      });
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTeamUpload = async (id) => {
    let cleanUrl = simulatedVideoUrl.trim();
    if (!cleanUrl) {
      toast.error("Please enter a valid video URL");
      return;
    }

    // Clean concatenated URLs (e.g. if user accidentally pasted https://...https://...)
    if (cleanUrl.includes('https://') && cleanUrl.indexOf('https://', 8) !== -1) {
      const parts = cleanUrl.split('https://').filter(Boolean);
      cleanUrl = 'https://' + parts[parts.length - 1];
    } else if (cleanUrl.includes('http://') && cleanUrl.indexOf('http://', 7) !== -1) {
      const parts = cleanUrl.split('http://').filter(Boolean);
      cleanUrl = 'http://' + parts[parts.length - 1];
    }
    
    if (uploadingBusy) return; // v330
    setUploadingBusy(true);
    toast.loading("Uploading production asset...", { id: "up" });
    try {
      await api.post(`/admin/ugc/orders/${id}/team-upload`, { 
        video_url: cleanUrl,
        videoUrl: cleanUrl, // v332: the server reads "videoUrl" — with only video_url every team upload failed ("videoUrl is required")
        // No thumbnail: a stock photo used to be sent here and shown to the brand (session 27).
        notes: teamNotes.trim()
      });
      toast.success("Uploaded on behalf of creator successfully!", { id: "up" });
      setUploadingOrder(null);
      setSelectedOrder(null);
      loadData();
    } catch (err) {
      console.error(err);
      { const m = err?.response?.data?.error; toast.error(typeof m === "string" && m && m.length < 160 ? m : "Couldn't upload the video. Please try again.", { id: "up" }); } // v332: calm text
    } finally {
      setUploadingBusy(false); // v330
    }
  };

  // Helper calculations
  const totalOrders = orders.length;
  // v332: counted with the real (uppercase) statuses — these were almost always 0
  const atRiskCount = orders.filter(o => ugcGroup(o) === 'claimed' && (o.alert_22hr_sent || isPastDeadline(o))).length;
  const deliveredCount = orders.filter(o => ugcGroup(o) === 'delivered').length;
  const completedCount = orders.filter(o => ugcGroup(o) === 'completed').length;

  // Filtered orders list
  const filteredOrders = orders.filter(o => {
    // Search filter
    const searchStr = searchTerm.toLowerCase();
    const matchesSearch = 
      String(o.id || '').toLowerCase().includes(searchStr) || // v332: numeric ids crashed search
      (o.product_name || o.title || '').toLowerCase().includes(searchStr) ||
      (o.brand_name || '').toLowerCase().includes(searchStr) ||
      (o.creator_name || '').toLowerCase().includes(searchStr);

    // Status filter
    const currentStatus = ugcGroup(o); // v332
    const matchesStatus = statusFilter === "All" || currentStatus === statusFilter.toLowerCase();

    // Risk Filter
    const isOverdue = isPastDeadline(o) && currentStatus === 'claimed';
    const isAtRisk = currentStatus === 'claimed' && (o.alert_22hr_sent || isOverdue);
    const matchesRisk = 
      riskFilter === "All text" ||
      (riskFilter === "At Risk" && isAtRisk) ||
      (riskFilter === "On Time" && !isAtRisk);

    return matchesSearch && matchesStatus && matchesRisk;
  });

  // Calculate remaining hours
  const getRemainingTimeText = (deadlineStr) => {
    if (!deadlineStr) return "No deadline";
    const diffMs = new Date(deadlineStr) - new Date();
    if (isNaN(diffMs)) return "No deadline"; // v330: was "NaNh left"
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffHrs < 0) {
      const positiveHrs = Math.abs(diffHrs);
      return `${positiveHrs}h overdue`;
    }
    return `${diffHrs}h left`;
  };

  return (
    <div className="space-y-6 w-full animate-in fade-in duration-200">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-2">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">UGC Orders</h2>
          <p className="text-sm text-gray-500 font-medium mt-1">Track and manage user-generated content deals.</p>
        </div>
      </div>

      {/* UGC KPI Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
         <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-5 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-[var(--violet-soft)] text-[var(--violet)] flex items-center justify-center">
              <Camera size={24} />
            </div>
            <div>
              <div className={'text-2xl font-black tracking-tight'}>{loading && !orders.length ? "…" : totalOrders}</div>
              <div className={'text-[10px] font-bold uppercase tracking-wider'}>Total UGC Deals</div>
            </div>
         </div>
         <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-5 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-rose-50 text-[var(--red)] flex items-center justify-center">
              <AlertTriangle size={24} />
            </div>
            <div>
              <div className={'text-2xl font-black tracking-tight'}>{loading && !orders.length ? "…" : atRiskCount}</div>
              <div className={'text-[10px] font-bold uppercase tracking-wider'}>Overdue / At Risk</div>
            </div>
         </div>
         <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-5 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Clock size={24} />
            </div>
            <div>
              <div className={'text-2xl font-black tracking-tight'}>{loading && !orders.length ? "…" : deliveredCount}</div>
              <div className={'text-[10px] font-bold uppercase tracking-wider'}>Delivered (Pending)</div>
            </div>
         </div>
         <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-5 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-[var(--green)] flex items-center justify-center">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <div className={'text-2xl font-black tracking-tight'}>{loading && !orders.length ? "…" : completedCount}</div>
              <div className={'text-[10px] font-bold uppercase tracking-wider'}>Fully Completed</div>
            </div>
         </div>
      </div>

      {/* Roster toolbar & filters */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Search box */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={16} />
            <input 
              type="text" 
              placeholder="Search by order ID, brand, product..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              // v330: 16px on phones so iOS doesn't zoom
              className="w-full pl-10 pr-4 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl focus:border-[var(--violet)] focus:outline-none text-[16px] sm:text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
            />
          </div>

          {/* Status filter dropdown */}
          <div className="relative">
            <select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
              className="appearance-none pl-4 pr-9 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl focus:border-[var(--violet)] focus:outline-none text-[16px] sm:text-sm text-[var(--text-primary)] cursor-pointer"
            >
              <option value="All" className="text-[var(--text-primary)]">All Statuses</option>
              <option value="Claimed" className="text-[var(--text-primary)]">Claimed / Active</option>
              <option value="Delivered" className="text-[var(--text-primary)]">Delivered</option>
              <option value="Completed" className="text-[var(--text-primary)]">Completed</option>
            </select>
            <Clock className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" size={14} />
          </div>

          {/* Risk status dropdown */}
          <div className="relative">
            <select 
              value={riskFilter} 
              onChange={(e) => setRiskFilter(e.target.value)}
              className="appearance-none pl-4 pr-9 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl focus:border-[var(--violet)] focus:outline-none text-[16px] sm:text-sm text-[var(--text-primary)] cursor-pointer"
            >
              <option value="All text" className="text-[var(--text-primary)]">All Delivery Tracks</option>
              <option value="At Risk" className="text-[var(--text-primary)]">Overdue / At Risk</option>
              <option value="On Time" className="text-[var(--text-primary)]">On Time</option>
            </select>
            <AlertTriangle className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" size={14} />
          </div>
        </div>

        {/* Reload button */}
        <button 
          onClick={loadData} 
          disabled={loading} /* v332 */
          className="disabled:opacity-50 px-4 py-2 bg-[var(--violet)] hover:opacity-90 text-white rounded-xl text-xs font-bold transition-all border border-transparent w-full md:w-auto cursor-pointer"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* UGC Orders Table */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          {/* v330: min width so the table scrolls inside its box on phones */}
          <table className="w-full min-w-[960px] text-left border-collapse">
            <thead>
              <tr className={'text-[10px] font-bold uppercase tracking-wider'}>
                <th className="px-5 py-4 font-medium">Order & Brand Info</th>
                <th className="px-5 py-4 font-medium">Content Requirement</th>
                <th className="px-5 py-4 font-medium">Claimed Creator</th>
                <th className="px-5 py-4 font-medium">Internal Deadline</th>
                <th className="px-5 py-4 font-medium text-right">Budget</th>
                <th className="px-5 py-4 font-medium">Track Status</th>
                <th className="px-5 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-foreground/5">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-[var(--text-tertiary)]">
                    Loading UGC orders...
                  </td>
                </tr>
              ) : loadError ? (
                <tr>{/* v330: a failed load read "No matching UGC orders found" */}
                  <td colSpan={7} className="px-5 py-12 text-center text-red-600">
                    Could not load UGC orders. <button type="button" onClick={loadData} className="underline font-bold cursor-pointer">Try again</button>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-[var(--text-secondary)]">
                    No matching UGC orders found in the platform registry.
                  </td>
                </tr>
              ) : (
                filteredOrders.map(order => {
                  const grp = ugcGroup(order); // v332: real statuses
                  const isOverdue = isPastDeadline(order) && grp === 'claimed';
                  const isAtRisk = grp === 'claimed' && (order.alert_22hr_sent || isOverdue);
                  
                  return (
                    <tr 
                      key={order.id} 
                      onClick={() => setSelectedOrder(order)}
                      className="hover:bg-[var(--bg-elevated)] transition-all duration-150 cursor-pointer group"
                    >
                      {/* Order ID & Brand info */}
                      <td className="px-5 py-4">
                        <div className={`font-mono tracking-tight text-sm text-xs text-[var(--violet)]`}>{order.id}</div>
                        <div className="flex items-center gap-2 mt-1.5">
                          {/* v330: no broken-image icon when there is no / a dead logo */}
                          {order.brand_logo ? (
                            <img 
                              src={order.brand_logo} 
                              alt="" 
                              onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                              className="w-5 h-5 rounded object-cover bg-[var(--bg-elevated)] border border-[var(--border-default)]" 
                            />
                          ) : <span className="w-5 h-5 rounded bg-[var(--bg-elevated)] border border-[var(--border-default)] shrink-0" />}
                          <span className="text-xs text-[var(--text-primary)] font-medium truncate max-w-[120px]">{order.brand_name}</span>
                        </div>
                      </td>

                      {/* Product Name & Details */}
                      <td className="px-5 py-4">
                        <div className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--violet)] transition-colors">{order.product_name || order.title}</div>
                        <div className={'text-[11px] font-medium'}>{[order.category, order.video_length].filter(Boolean).join(" • ") || "—"}</div>{/* v332: no made-up "30s" / "undefined •" */}
                      </td>

                      {/* Claimed Creator */}
                      <td className="px-5 py-4">
                        {order.creator_id ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-[var(--violet-soft)] text-[var(--violet)] border border-[var(--violet-border)] font-bold flex items-center justify-center text-[10px]">
                              {order.creator_name ? order.creator_name[0] : 'C'}
                            </div>
                            <span className="text-xs font-semibold text-[var(--text-primary)]">{order.creator_name || "Assigned Creator"}</span>
                          </div>
                        ) : (
                          <span className={'text-[11px] font-medium'}>Awaiting claims</span>
                        )}
                      </td>

                      {/* Timeline / Remaining time */}
                      <td className="px-5 py-4">
                        <div className={'text-[11px] font-medium'}>
                          {getRemainingTimeText(order.internal_deadline)}
                        </div>
                        <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
                          {istDateTime(order.internal_deadline)}{/* v330: date + time in IST (was browser-time, time only) */}
                        </div>
                      </td>

                      {/* Budget */}
                      <td className={`px-5 py-4 text-right font-mono tracking-tight text-sm`}>
                        ₹{(Number(order.budget) || 0).toLocaleString('en-IN')}{/* v330: string budgets were not grouped */}
                      </td>

                      {/* Track status */}
                      <td className="px-5 py-4">
                        {isAtRisk ? (
                          <span className="px-2 py-0.5 bg-rose-50 text-[var(--red)] border border-rose-100 rounded-full text-[10px] font-bold flex items-center gap-1 w-fit">
                            <AlertTriangle size={10} /> {isOverdue ? 'OVERDUE' : 'AT RISK'}
                          </span>
                        ) : grp === 'completed' ? (
                          <span className="px-2 py-0.5 bg-emerald-50 text-[var(--green)] border border-emerald-100 rounded-full text-[10px] font-bold flex items-center gap-1 w-fit">
                            <CheckCircle2 size={10} /> COMPLETED
                          </span>
                        ) : grp === 'delivered' ? (
                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-full text-[10px] font-bold flex items-center gap-1 w-fit">
                            <Clock size={10} /> UNDER REVIEW
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-emerald-50/50 text-[var(--green)] border border-emerald-100 rounded-full text-[10px] font-bold flex items-center gap-1 w-fit">
                            ON TIME
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => setViewingContractOrder(order)} 
                            className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 border border-emerald-500/20 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                            title="View Signed SLA Contract"
                          >
                            <ShieldCheck size={12} />
                            <span>SLA Contract</span>
                          </button>
                          {isAtRisk && (
                            <button 
                              onClick={() => { setUploadingOrder(order); setSelectedOrder(null); }} 
                              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shadow-sm cursor-pointer"
                            >
                              <Upload size={12}/> Team Intervention
                            </button>
                          )}
                          <button 
                            onClick={() => setSelectedOrder(order)}
                            className="px-2.5 py-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--violet-soft)] text-[var(--text-secondary)] hover:text-[var(--violet)] border border-[var(--border-default)] hover:border-[var(--violet-border)] text-xs font-bold rounded-lg transition-all cursor-pointer"
                          >
                            Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETAILED UGC BRIEF REVIEW SIDE-DRAWER */}
      <Presence>{selectedOrder && (
        <PopupBackdrop className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm">
          <PopupPanel kind="drawer" className="w-full max-w-2xl bg-[var(--bg-card)] border-l border-[var(--border-default)] h-full overflow-y-auto flex flex-col shadow-2xl relative">
            
            {/* Header */}
            <div className="p-6 border-b border-[var(--border-default)] flex items-center justify-between bg-[var(--bg-card)] sticky top-0 z-10">
              <button 
                onClick={() => setSelectedOrder(null)} 
                className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium text-sm transition-colors cursor-pointer"
              >
                <ArrowLeft size={16} /> Close Brief
              </button>
              <div className="flex items-center gap-2">
                <span className={'text-[11px] font-medium'}>UGC Deal: {selectedOrder.id}</span>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6 flex-1">
              
              {/* Product and brand card header */}
              <div className="flex items-start gap-4 pb-6 border-b border-[var(--border-default)]">
                <img 
                  src={selectedOrder.brand_logo || undefined} 
                  alt="" 
                  onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} // v330: no broken-image icon
                  className="w-14 h-14 shrink-0 rounded-xl object-cover bg-[var(--bg-elevated)] border border-[var(--border-default)]" 
                />
                <div>
                  <h2 className={'text-xl font-bold tracking-tight'}>{selectedOrder.product_name || selectedOrder.title}</h2>
                  <p className={'text-sm text-gray-500'}>Campaign hosted by <span className="text-[var(--text-primary)] font-semibold">{selectedOrder.brand_name}</span></p>
                  <div className="flex gap-2 mt-2">
                    <span className={'text-[11px] font-medium'}>{selectedOrder.category}</span>
                    {selectedOrder.video_length && <span className={'text-[11px] font-medium'}>Length: {selectedOrder.video_length}</span>}{/* v332: no made-up "30s" */}
                  </div>
                </div>
              </div>

              {/* Status Banner */}
              <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] space-y-3">
                <div className="flex items-center justify-between">
                  <span className={'text-[10px] font-bold uppercase tracking-wider'}>Collaboration Status</span>
                  <div className="flex items-center gap-2">
                    <span className={'text-[11px] font-medium'}>{prettyStatus(selectedOrder.status)}{/* v330: no raw enum */}</span>
                    {selectedOrder.team_intervened && (
                      <span className="px-2 py-0.5 bg-red-500/15 text-red-400 border border-red-500/20 rounded text-[10px] font-bold">TEAM INTERVENED</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[var(--border-default)]">
                  <div>
                    <span className={'text-[10px] font-bold uppercase tracking-wider'}>Claimed Creator</span>
                    <strong className="text-sm text-[var(--text-primary)] mt-0.5 block">{selectedOrder.creator_name || "Awaiting claims"}</strong>
                  </div>
                  <div>
                    <span className={'text-[10px] font-bold uppercase tracking-wider'}>Internal Deadline</span>
                    <strong className="text-sm text-[var(--text-primary)] mt-0.5 block">{istDateTime(selectedOrder.internal_deadline)}{/* v330: IST */}</strong>
                  </div>
                </div>

                <div className="pt-2 border-t border-[var(--border-default)]">
                  <button 
                    onClick={() => setViewingContractOrder(selectedOrder)} 
                    className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 border border-emerald-500/20 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ShieldCheck size={16} /> View Stamped Signed SLA Agreement Document
                  </button>
                </div>
              </div>

              {/* Instructions and Brief specs */}
              <div className="space-y-4">
                <h3 className="text-base font-bold font-sans text-[var(--text-primary)] flex items-center gap-2">
                  <FileText size={16} className="text-[var(--violet)]" /> Content Production Guidelines
                </h3>
                <div className="p-5 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl space-y-4">
                  <div>
                    <span className={'text-[10px] font-bold uppercase tracking-wider'}>Script Instructions</span>
                    <p className={'text-sm text-gray-500'}>{selectedOrder.instructions || "No detailed instructions provided."}</p>
                  </div>
                  {selectedOrder.ref_link && (
                    <div className="pt-3 border-t border-[var(--border-default)]">
                      <span className={'text-[10px] font-bold uppercase tracking-wider'}>Reference / Inspiration Asset</span>
                      <a href={selectedOrder.ref_link} target="_blank" rel="noreferrer" className="text-[var(--violet)] hover:underline text-xs flex items-center gap-1 mt-1 font-semibold">
                        View Reference Media <ExternalLink size={12} />
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Deliveries / Upload segment */}
              <div className="space-y-4">
                <h3 className="text-base font-bold font-sans text-[var(--text-primary)] flex items-center gap-2">
                  <Play size={16} className="text-[var(--violet)]" /> Video Production Assets
                </h3>
                
                {selectedOrder.submitted_video_url ? (
                  <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl">
                    <span className={'text-[10px] font-bold uppercase tracking-wider'}>Submitted Video Asset</span>
                    <div className="mt-3 relative bg-black rounded-xl overflow-hidden border border-[var(--border-default)]">
                      <VideoEmbedPreview
                        url={selectedOrder.submitted_video_url}
                        title="Submitted Deliverable Video Asset"
                        isApproved={selectedOrder.stage === "COMPLETED" || selectedOrder.stage === "APPROVED"}
                        watermark={!(selectedOrder.stage === "COMPLETED" || selectedOrder.stage === "APPROVED")}
                      />
                    </div>
                    <div className={'text-[11px] font-medium'}>
                      <span>Source: {selectedOrder.team_intervened ? 'In-house Intervention' : 'Creator Upload'}</span>
                      {selectedOrder.delivered_at && <span>Uploaded: {istDateTime(selectedOrder.delivered_at)}{/* v330: IST */}</span>}
                    </div>
                  </div>
                ) : (
                  <div className="p-5 bg-[var(--bg-elevated)] border border-dashed border-[var(--border-default)] rounded-xl text-center space-y-3">
                    <AlertTriangle size={32} className="mx-auto text-amber-500 opacity-60" />
                    <div>
                      <p className={'font-bold text-sm'}>No deliverable uploaded yet</p>
                      <p className={'text-[11px] font-medium'}>The creator has not submitted any drafts for this deal yet.</p>
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Bottom sticky intervention control */}
            {!['completed', 'delivered'].includes(ugcGroup(selectedOrder)) && ( /* v332: real statuses */
              <div className="p-6 border-t border-[var(--border-default)] bg-[var(--bg-card)] sticky bottom-0" style={{ paddingBottom: "max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))" }}>
                <button 
                  onClick={() => { setUploadingOrder(selectedOrder); setSelectedOrder(null); }}
                  className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  <Upload size={18} /> Take Over & Upload on Behalf of Creator
                </button>
                <p className="text-[10px] text-[var(--text-tertiary)] text-center mt-2">
                  Your video is sent to the brand for review in place of the creator's draft.{/* v332: was a made-up "100% payout lock" claim */}
                </p>
              </div>
            )}
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

      {/* TEAM INTERVENTION UPLOAD OVERLAY DIALOG */}
      <Presence>{uploadingOrder && (
        <PopupBackdrop className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <PopupPanel kind="modal" className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl w-full max-w-lg shadow-2xl relative animate-scale-in max-h-[90dvh] overflow-y-auto">{/* v330: scrolls on short phones */}
            
            <div className="p-5 border-b border-[var(--border-default)] flex items-center justify-between bg-[var(--bg-card)]">
              <h3 className="font-sans font-bold text-lg text-[var(--text-primary)] flex items-center gap-2">
                <ShieldAlert className="text-red-500" size={20} /> In-House Team Intervention
              </h3>
              <button onClick={() => setUploadingOrder(null)} aria-label="Close" /* v332 */ className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer">
                <XCircle size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-rose-50 border border-rose-100 rounded-xl p-3.5 flex items-start gap-3 text-xs text-[var(--red)]">
                <AlertTriangle size={20} className="shrink-0 mt-0.5 text-red-500" />
                <div>
                  <strong className="font-semibold block mb-0.5">Administrative Action Required</strong>
                  You are completing <strong className="text-rose-900">"{uploadingOrder.product_name || uploadingOrder.title || "this order"}"</strong>{/* v332: no "undefined" */} on behalf of <strong className="text-rose-900">{uploadingOrder.creator_name || "the creator"}</strong>. This bypasses creator production penalties and immediately transfers the review responsibility to YBEX in-house.
                </div>
              </div>

              {/* Video URL Input */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={'text-[10px] font-bold uppercase tracking-wider'}>Asset Deliverable Video URL *</label>
                  {simulatedVideoUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewModalUrl(simulatedVideoUrl);
                        setShowPreviewModal(true);
                      }}
                      className="text-xs font-bold text-[var(--violet)] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Play size={13} /> Universal Preview
                    </button>
                  )}
                </div>
                <input 
                  type="text"
                  placeholder="https://drive.google.com/... or https://.../video.mp4"
                  value={simulatedVideoUrl}
                  onChange={(e) => setSimulatedVideoUrl(e.target.value)}
                  className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl focus:border-[var(--violet)] focus:outline-none text-[var(--text-primary)] text-[16px] sm:text-sm" /* v332: no iOS zoom */
                />
                <span className="text-[10px] text-[var(--text-tertiary)] mt-1.5 block">
                  Provide Google Drive, YouTube, MP4, or cloud video asset link.
                </span>
              </div>

              {/* Notes Input */}
              <div>
                <label className={'text-[10px] font-bold uppercase tracking-wider'}>Admin / Team Notes *</label>
                <textarea
                  rows={3}
                  value={teamNotes}
                  onChange={(e) => setTeamNotes(e.target.value)}
                  placeholder="State the reason of intervention (e.g., Creator missed 24h final deadline)"
                  className="w-full p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl focus:border-[var(--violet)] focus:outline-none text-[var(--text-primary)] text-[16px] sm:text-sm" /* v332: no iOS zoom */
                />
              </div>
            </div>

            <div className="p-5 bg-[var(--bg-card)] border-t border-[var(--border-default)] flex gap-3 justify-end items-center">
              <button 
                onClick={() => setUploadingOrder(null)} 
                className="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 font-semibold text-sm transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button 
                disabled={uploadingBusy || !simulatedVideoUrl.trim() || !teamNotes.trim()} // v330: busy
                onClick={() => handleTeamUpload(uploadingOrder.id)} 
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Upload size={16} /> Complete Intervention Upload
              </button>
            </div>

          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

      {/* Admin Signed Contract Viewer Modal */}
      {viewingContractOrder && (
        <AdminSignedContractModal 
          order={viewingContractOrder}
          onClose={() => setViewingContractOrder(null)}
        />
      )}

      {/* Admin Universal Video Preview Modal */}
      <UniversalPreviewModal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        url={previewModalUrl}
        title="Admin Asset Live Deliverable Inspection"
        notes={teamNotes}
      />
    </div>
  );
}
