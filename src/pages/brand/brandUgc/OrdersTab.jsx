import React from "react";
import { orderWindowHours } from "../../../utils/ugcTerms";
import { Video, Clock, ShieldCheck, Plus, ChevronRight, AlertCircle, RefreshCw } from "lucide-react";
import { UGCOrderListSkeleton } from "../../../components/common/MobileSkeletons";
import { OfflineAware } from "../../../components/common/OfflineState"; // v334
import { formatINROrDash } from "../../../utils/safeFormat"; // v415


// Session 49 (clean-up): moved out of BrandUGCMobile.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function OrdersTab(props) {
  const { ordersError, onRetry, refreshing, activeTab, filteredOrders, getSlaTimeLeft, handleStartNewBrief, loading, orderFilter, orders, setOrderFilter, setSelectedOrder, setSelectedOrderId, setView } = props;
  const { briefFilterTitle, onClearBriefFilter } = props; // v416 (U27): "Manage orders" on one brief
  return <>{activeTab === "orders" && (
          <div className="space-y-3.5">
            {loading && orders.length === 0 ? (
              <UGCOrderListSkeleton count={3} />
            ) : ordersError && orders.length === 0 ? (
              /* v330: the request failed — not "No UGC Orders Found" */
              <OfflineAware className="my-4" onRetry={onRetry}>{/* v334: offline → OfflineState */}
              <div className="bg-white rounded-[20px] p-8 text-center border border-[#E5E5EA] shadow-xs space-y-3 my-4" data-testid="brand-orders-error">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
                  <AlertCircle size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#0A0A0A]">Couldn't load your orders</h3>
                  <p className="text-xs text-[#6B7280] mt-1">Check your connection and try again.</p>
                </div>
                <button
                  onClick={onRetry}
                  disabled={refreshing}
                  className="inline-flex items-center gap-1.5 bg-[#7C3AED] text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-xs cursor-pointer active:scale-95 transition-all disabled:opacity-60"
                >
                  <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Try again
                </button>
              </div>
              </OfflineAware>
            ) : orders.length === 0 ? (
              /* SCREEN 02: Orders Empty State */
              <div className="bg-white rounded-[20px] p-8 text-center border border-[#E5E5EA] shadow-xs space-y-3.5 my-4">
                <div className="w-14 h-14 rounded-2xl bg-[#F1E8FF] text-[#7C3AED] flex items-center justify-center mx-auto">
                  <Video size={28} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#0A0A0A]">No UGC Orders Found</h3>
                  <p className="text-xs text-[#6B7280] mt-1 max-w-xs mx-auto leading-relaxed">
                    Create your first brief to recruit verified creators and get UGC videos in 24–72 hours.
                  </p>
                </div>
                <button 
                  onClick={handleStartNewBrief}
                  className="inline-flex items-center gap-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm active:scale-95 transition-all cursor-pointer"
                >
                  <Plus size={15} /> Post your first brief
                </button>
              </div>
            ) : (
              /* SCREEN 09: Manage Orders List */
              <>
                {/* Search & Filter pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar -mx-4 px-4" role="group" aria-label="Filter orders">{/* v415: real hide-scrollbar class; chips can scroll edge to edge */}
                  {[
                    { id: "all", label: "All" },
                    { id: "review", label: "Review" },
                    { id: "in_progress", label: "In Production" },
                    { id: "revision", label: "Revision" }, // v416 (U28): same filters as desktop
                    { id: "done", label: "Done" }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setOrderFilter(tab.id)}
                      aria-pressed={orderFilter === tab.id} // v332: 36px tap height
                      className={`px-3.5 py-1.5 min-h-[36px] rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                        orderFilter === tab.id
                          ? 'bg-[#7C3AED] text-white shadow-xs'
                          : 'bg-white border border-[#E5E5EA] text-[#6B7280] hover:text-[#0A0A0A]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {briefFilterTitle && (
                  <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#F5F0FF] border border-[#DDD6FE] text-xs" data-testid="ugc-orders-brief-filter">
                    <span className="min-w-0 truncate text-[#6B7280]">Brief: <b className="text-[#0A0A0A]">{briefFilterTitle}</b></span>
                    <button type="button" onClick={onClearBriefFilter} className="shrink-0 min-h-[36px] px-2.5 rounded-lg font-bold text-[#7C3AED] active:bg-white/60">Show all</button>
                  </div>
                )}
                {/* Orders List */}
                <div className="space-y-3">
                  {filteredOrders.length === 0 ? (
                    <div className="bg-white rounded-[18px] p-6 text-center border border-[#E5E5EA] text-xs text-[#6B7280]">
                      {briefFilterTitle && orderFilter === "all" ? "No creator has claimed this brief yet, so it has no orders." : "No orders match the selected filter."}{/* v416 (U27) */}
                    </div>
                  ) : (
                    filteredOrders.map(order => {
                      const stage = (order.stage || order.brand_status || order.status || "IN_PROGRESS").toUpperCase();
                      const thrFlow = (order.flow_state || order.thread_flow_state || '').toUpperCase();
                      // v344: cancelled / expired / refunded orders are closed — grey badge, no timer, no "Payment Hold"
                      const isClosed = ["CANCELLED", "CANCELED", "EXPIRED", "REFUNDED"].includes(stage) || ["CANCELLED", "CANCELED", "EXPIRED", "REFUNDED"].includes(thrFlow);
                      const isCompleted = !isClosed && (stage === "COMPLETED" || stage === "PAID" || thrFlow === "COMPLETED");
                      // v358: states where the brand must act / wait used to read "In Production" or "Waiting Live Link"
                      const isDeclined = !isClosed && !isCompleted && (stage.includes("DECLINED") || thrFlow.includes("DECLINED"));
                      const isChangesAsked = !isClosed && !isCompleted && !isDeclined && (stage.startsWith("REVISION_REQ") || thrFlow.startsWith("REVISION_REQ") || stage === "IN_REVISION");
                      const isLinkStage = stage.endsWith("_LINKS") || thrFlow.endsWith("_LINKS");
                      const isAwaitingLiveLink = !isClosed && !isDeclined && !isChangesAsked && (stage === "AWAITING_LIVE_LINK" || stage === "COMPLETED_APPROVAL" || stage === "CONTENT_APPROVED" || thrFlow === "CONTENT_APPROVED" || order.content_approved === true);
                      const isLiveLinkSubmitted = !isClosed && !isDeclined && !isChangesAsked && (stage === "LIVE_LINK_SUBMITTED" || stage === "PROOF_SUBMITTED" || thrFlow === "PROOF_SUBMITTED");
                      const isInReview = !isClosed && !isCompleted && !isDeclined && !isChangesAsked && !isAwaitingLiveLink && !isLiveLinkSubmitted && (stage === "IN_REVIEW" || stage === "SUBMITTED");
                      const sla = getSlaTimeLeft(order.deadline || order.internal_deadline || order.sla_deadline, orderWindowHours(order)) /* Session 58: the API sends internal_deadline */;
                      const amount = [order.amount, order.agreed_amount, order.creator_payout, order.escrow_amount, order.budget, order.brief?.budget].map(Number).find((n) => Number.isFinite(n) && n > 0) || 0; // v415: + escrow_amount / brief budget
                      const orderNumber = order.order_number || order.orderNumber || `#ORD-${String(order.id).slice(-6).toUpperCase()}`;

                      return (
                        <div 
                          key={order.id}
                          className="bg-white rounded-[18px] p-4 border border-[#E5E5EA] shadow-xs space-y-3"
                        >
                          {/* Top Row: Creator Avatar + Title + Status */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">{/* v330: long titles/names truncate instead of pushing the badge off-card */}
                              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#7C3AED] to-[#A78BFA] text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                                {(order.creator_name || order.creatorName || "C")[0].toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <h3 className="text-sm font-bold text-[#0A0A0A] truncate">{/* v415: clean ellipsis (break-all split words) */}
                                  {order.title || order.brief?.title || order.brief?.product_name || order.campaign_title || "UGC Deliverable"}
                                </h3>
                                <p className="text-[10px] text-[#6B7280] font-medium truncate">
                                  {order.creator_name || order.creatorName || "Creator"} ·{/* v332: no made-up "Verified UGC Creator" */} <span className="font-mono">{orderNumber}</span>
                                </p>
                              </div>
                            </div>

                            {/* Badge */}
                            <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
                              isClosed
                                ? 'bg-[#F2F2F7] text-[#6B7280] border border-[#E5E5EA]'
                                : isCompleted 
                                ? 'bg-[#E9F9EF] text-[#16A34A]' 
                                : isLiveLinkSubmitted
                                  ? 'bg-[#F3E8FF] text-[#7C3AED] border border-[#DDD6FE]'
                                  : isAwaitingLiveLink
                                    ? 'bg-[#EEF2FF] text-[#4F46E5] border border-[#C7D2FE]'
                                    : isDeclined
                                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                      : isChangesAsked
                                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                    : isInReview 
                                      ? 'bg-[#FFF7E6] text-[#B45309] border border-[#FDE68A]' 
                                      : 'bg-[#EFF6FF] text-[#1D4ED8]'
                            }`}>
                              {isClosed ? "Closed" : isCompleted ? "Done" : isDeclined ? "Creator declined" : isChangesAsked ? "Changes asked" : isLiveLinkSubmitted ? "Live Review" : isAwaitingLiveLink ? "Waiting Live Link" : isInReview ? "Review" : "In Production"}
                            </span>
                          </div>

                          {/* Progress & SLA */}
                          <div className="space-y-1.5 pt-1">
                            <div className="flex justify-between items-center gap-2 text-xs">
                              <span className="text-[11px] font-medium text-[#6B7280] min-w-0">
                                {isClosed ? (stage === "REFUNDED" || thrFlow === "REFUNDED" ? "Order closed • Refunded" : stage.startsWith("EXPIRED") || thrFlow === "EXPIRED" ? "Order expired" : "Order cancelled") : isCompleted ? "Delivered & Approved" : isDeclined ? `Creator declined your ${isLinkStage ? "link" : "video"} changes • Your call` : isChangesAsked ? `Changes asked • Waiting for the ${isLinkStage ? "corrected link" : "revised video"}` : isLiveLinkSubmitted ? "Live post submitted • Under review" : isAwaitingLiveLink ? "Draft approved • Waiting for live link" : isInReview ? "Waiting for approval" : "In production"}
                              </span>
                              {/* v332: no running/overdue timer on a finished order */}
                              {!isCompleted && !isClosed && !isDeclined && !isChangesAsked && !isInReview && !isAwaitingLiveLink && !isLiveLinkSubmitted && sla?.text && ( /* v344: no timer on a closed order · v358: the creator's draft timer only while filming — "Past deadline" on a draft waiting for YOUR approval was wrong */
                              <span className="text-[10px] font-mono font-bold text-[#6D28D9] flex items-center gap-1 shrink-0">
                                <Clock size={11} /> {sla.text}
                              </span>
                              )}
                            </div>
                            <div className="w-full bg-[#E5E5EA] h-1.5 rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all ${isClosed ? 'bg-[#D1D5DB]' : isCompleted ? 'bg-[#10B981]' : 'bg-[#7C3AED]'}`}
                                style={{ width: `${isCompleted || isClosed || isDeclined || isChangesAsked || isInReview || isAwaitingLiveLink || isLiveLinkSubmitted ? 100 : sla.percent}%` }}
                              />
                            </div>
                          </div>

                          {/* Escrow Held & Manage Button */}
                          <div className="flex items-center justify-between pt-2 border-t border-[#E5E5EA]">
                            <div>
                              <span className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider block">{isClosed ? (stage === "REFUNDED" || thrFlow === "REFUNDED" ? "Refunded" : "Order amount") : isCompleted ? "Paid" : "Payment Hold"}</span>{/* v344 */}{/* v332: a finished order's money is no longer on hold */}
                              <span className="text-xs font-black text-[#0A0A0A]">{formatINROrDash(amount > 0 ? amount : null) /* v415: "—", never ₹0 */}</span>
                            </div>

                            <button 
                              onClick={() => {
                                setSelectedOrderId(order.id);
                                setSelectedOrder(order);
                                setView("order-detail");
                              }}
                              className="px-3.5 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-xl font-bold text-xs flex items-center gap-1 shadow-xs active:scale-95 transition-all cursor-pointer"
                            >
                              <span>Manage order</span> <ChevronRight size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Escrow Policy Notice Card */}
                <div className="bg-[#EFF6FF] border border-[#DBEAFE] rounded-xl p-3.5 flex gap-2.5 text-xs text-[#1E3A8A]">
                  <ShieldCheck size={18} className="shrink-0 text-[#2563EB]" />
                  <p className="text-[11px] leading-relaxed">
                    Released only after you approve. If a creator misses the deadline, the order closes and your brief is relisted.{/* v358: there is no automatic release */}
                  </p>
                </div>
              </>
            )}
          </div>
        )}</>;
}
