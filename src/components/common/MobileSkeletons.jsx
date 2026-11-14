import React from "react";

/**
 * Base Shimmer Element
 */
export function Skeleton({ className = "", ...props }) {
  return (
    <div
      className={`bg-slate-200/80 rounded animate-pulse ${className}`}
      {...props}
    />
  );
}

/**
 * 1. UGC Brief Card Skeleton (for CreatorUGCMobile Explore Tab)
 */
export function UGCCardSkeleton() {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-[18px] p-3.5 shadow-xs flex flex-col pointer-events-none select-none">
      {/* Top row: Brand Avatar, Title/Brand, Payout */}
      <div className="flex items-center gap-[11px]">
        <div className="w-[40px] h-[40px] rounded-[12px] bg-slate-200/90 animate-pulse shrink-0" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="h-4 w-3/4 bg-slate-200 rounded-md animate-pulse" />
          <div className="h-3 w-1/2 bg-slate-100 rounded-md animate-pulse" />
        </div>
        <div className="h-5 w-16 bg-slate-200/90 rounded-md animate-pulse shrink-0" />
      </div>

      {/* Middle row: 3 specification badges */}
      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        <div className="h-[22px] w-20 rounded-[7px] bg-slate-100 animate-pulse" />
        <div className="h-[22px] w-14 rounded-[7px] bg-slate-100 animate-pulse" />
        <div className="h-[22px] w-16 rounded-[7px] bg-slate-100 animate-pulse" />
      </div>

      {/* Escrow badge bar */}
      <div className="mt-3 h-8 w-full rounded-[11px] bg-slate-50 border border-slate-100 flex items-center px-3 gap-2">
        <div className="w-3.5 h-3.5 rounded-full bg-slate-200 animate-pulse shrink-0" />
        <div className="h-2.5 w-44 bg-slate-200/70 rounded animate-pulse" />
      </div>

      {/* Action button placeholder */}
      <div className="mt-3 h-[48px] rounded-[14px] bg-slate-200/80 animate-pulse" />
    </div>
  );
}

/**
 * Multiple UGC Brief Cards List Skeleton
 */
export function UGCCardsListSkeleton({ count = 3 }) {
  return (
    <div className="space-y-3.5">
      {Array.from({ length: count }).map((_, i) => (
        <UGCCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * 2. UGC Order Card Skeleton (for CreatorUGCMobile / BrandUGCMobile Orders Tab)
 */
export function UGCOrderCardSkeleton() {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-[18px] p-[13px] shadow-xs flex flex-col pointer-events-none select-none">
      {/* Top row */}
      <div className="flex items-center gap-[11px]">
        <div className="w-[40px] h-[40px] rounded-[12px] bg-slate-200/90 animate-pulse shrink-0" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="h-4 w-3/5 bg-slate-200 rounded-md animate-pulse" />
          <div className="h-3 w-2/5 bg-slate-100 rounded-md animate-pulse" />
        </div>
        <div className="h-5 w-16 bg-slate-200 rounded-md animate-pulse shrink-0" />
      </div>

      {/* Timer / Status box */}
      <div className="mt-3 rounded-[14px] bg-slate-50 border border-slate-100 p-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-slate-200/80 animate-pulse shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 w-28 bg-slate-200 rounded animate-pulse" />
          <div className="h-2.5 w-20 bg-slate-100 rounded animate-pulse" />
        </div>
      </div>

      {/* Action button */}
      <div className="mt-3 h-[46px] rounded-[13px] bg-slate-200/80 animate-pulse" />
    </div>
  );
}

/**
 * Multiple UGC Order Cards Skeleton
 */
export function UGCOrderListSkeleton({ count = 3 }) {
  return (
    <div className="space-y-3.5">
      {Array.from({ length: count }).map((_, i) => (
        <UGCOrderCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * 3. Brand Brief Card Skeleton (for BrandUGCMobile Briefs Tab)
 */
export function BrandBriefCardSkeleton() {
  return (
    <div className="bg-white border border-[#E5E5EA] rounded-[18px] p-4 shadow-xs flex flex-col gap-3 pointer-events-none select-none">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-3 w-20 bg-slate-200 rounded animate-pulse" />
          <div className="h-4.5 w-4/5 bg-slate-200 rounded-md animate-pulse" />
        </div>
        <div className="h-6 w-16 bg-slate-100 rounded-full animate-pulse shrink-0" />
      </div>

      <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-100">
        <div className="space-y-1">
          <div className="h-2.5 w-12 bg-slate-100 rounded animate-pulse" />
          <div className="h-4 w-16 bg-slate-200 rounded animate-pulse" />
        </div>
        <div className="space-y-1">
          <div className="h-2.5 w-12 bg-slate-100 rounded animate-pulse" />
          <div className="h-4 w-14 bg-slate-200 rounded animate-pulse" />
        </div>
        <div className="space-y-1">
          <div className="h-2.5 w-12 bg-slate-100 rounded animate-pulse" />
          <div className="h-4 w-12 bg-slate-200 rounded animate-pulse" />
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="h-3 w-28 bg-slate-100 rounded animate-pulse" />
        <div className="h-8 w-24 bg-slate-200/80 rounded-xl animate-pulse" />
      </div>
    </div>
  );
}

export function BrandBriefListSkeleton({ count = 3 }) {
  return (
    <div className="space-y-3.5">
      {Array.from({ length: count }).map((_, i) => (
        <BrandBriefCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * 4. Inbox Conversation Row Skeleton (for InboxMobile)
 */
export function InboxRowSkeleton() {
  return (
    <div className="px-4 py-3.5 flex items-center gap-3 border-b border-gray-100 pointer-events-none select-none">
      <div className="w-12 h-12 rounded-full bg-slate-200 animate-pulse shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center justify-between">
          <div className="h-4 w-28 bg-slate-200 rounded-md animate-pulse" />
          <div className="h-3 w-10 bg-slate-100 rounded animate-pulse" />
        </div>
        <div className="h-3 w-4/5 bg-slate-100 rounded animate-pulse" />
      </div>
    </div>
  );
}

export function InboxListSkeleton({ count = 6 }) {
  return (
    <div className="divide-y divide-gray-100">
      {Array.from({ length: count }).map((_, i) => (
        <InboxRowSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * 5. Notifications Row Skeleton (for NotificationsMobile)
 */
export function NotificationRowSkeleton() {
  return (
    <div className="p-4 border-b border-gray-100 flex items-start gap-3 pointer-events-none select-none">
      <div className="w-10 h-10 rounded-full bg-slate-200 animate-pulse shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-3.5 w-3/4 bg-slate-200 rounded animate-pulse" />
        <div className="h-3 w-1/2 bg-slate-100 rounded animate-pulse" />
        <div className="h-2.5 w-20 bg-slate-100 rounded animate-pulse mt-1" />
      </div>
    </div>
  );
}

export function NotificationListSkeleton({ count = 6 }) {
  return (
    <div className="divide-y divide-gray-100">
      {Array.from({ length: count }).map((_, i) => (
        <NotificationRowSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * 6. Creator Home Dashboard Skeleton (for CreatorHomeMobile)
 */
export function CreatorHomeSkeleton() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 pointer-events-none select-none">
      {/* Top App Bar */}
      <div className="bg-white border-b border-slate-100 px-4 pt-3 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-slate-200 animate-pulse" />
          <div className="space-y-1">
            <div className="h-2.5 w-16 bg-slate-100 rounded animate-pulse" />
            <div className="h-3.5 w-24 bg-slate-200 rounded animate-pulse" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-slate-100 animate-pulse" />
          <div className="w-8 h-8 rounded-full bg-slate-100 animate-pulse" />
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Banner carousel skeleton */}
        <div className="w-full h-40 rounded-2xl bg-gradient-to-br from-slate-200 to-slate-100 animate-pulse" />

        {/* 2 Quick action cards side-by-side */}
        <div className="grid grid-cols-2 gap-3">
          <div className="h-24 rounded-2xl bg-white border border-slate-200/70 p-3 space-y-2">
            <div className="w-8 h-8 rounded-xl bg-slate-100 animate-pulse" />
            <div className="h-3.5 w-20 bg-slate-200 rounded animate-pulse" />
            <div className="h-2.5 w-14 bg-slate-100 rounded animate-pulse" />
          </div>
          <div className="h-24 rounded-2xl bg-white border border-slate-200/70 p-3 space-y-2">
            <div className="w-8 h-8 rounded-xl bg-slate-100 animate-pulse" />
            <div className="h-3.5 w-20 bg-slate-200 rounded animate-pulse" />
            <div className="h-2.5 w-14 bg-slate-100 rounded animate-pulse" />
          </div>
        </div>

        {/* Feed section title */}
        <div className="flex items-center justify-between pt-1">
          <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
          <div className="h-3 w-16 bg-slate-100 rounded animate-pulse" />
        </div>

        {/* Feed cards */}
        <UGCCardsListSkeleton count={3} />
      </div>
    </div>
  );
}

/**
 * 7. Earnings Dashboard Skeleton (for CreatorEarningsMobile)
 */
export function CreatorEarningsSkeleton() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 p-4 space-y-4 pointer-events-none select-none">
      {/* Balance Card */}
      <div className="w-full rounded-2xl bg-slate-200/90 p-5 space-y-3 animate-pulse">
        <div className="h-3 w-28 bg-slate-300 rounded" />
        <div className="h-8 w-44 bg-slate-300 rounded-lg" />
        <div className="h-3 w-32 bg-slate-300 rounded" />
      </div>

      {/* 2 Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-2">
          <div className="h-3 w-20 bg-slate-100 rounded animate-pulse" />
          <div className="h-5 w-24 bg-slate-200 rounded animate-pulse" />
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-2">
          <div className="h-3 w-20 bg-slate-100 rounded animate-pulse" />
          <div className="h-5 w-24 bg-slate-200 rounded animate-pulse" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <div className="h-8 w-20 bg-slate-200 rounded-xl animate-pulse" />
        <div className="h-8 w-20 bg-slate-100 rounded-xl animate-pulse" />
        <div className="h-8 w-20 bg-slate-100 rounded-xl animate-pulse" />
      </div>

      {/* Transactions list */}
      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 p-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-3 flex items-center justify-between">
            <div className="space-y-1.5">
              <div className="h-3.5 w-36 bg-slate-200 rounded animate-pulse" />
              <div className="h-2.5 w-24 bg-slate-100 rounded animate-pulse" />
            </div>
            <div className="h-4 w-16 bg-slate-200 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

// v333 (Ravi: "my campaign ki skeleton choti si middle mai aati hai"): full-width, shaped like the real list —
// title, tabs, then campaign cards (brand face, title, two lines, pay + status). Phone and desktop.
export function CampaignListSkeleton({ count = 4 }) {
  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-8 py-5 md:py-8 space-y-4 pointer-events-none select-none" aria-busy="true" aria-label="Loading your campaigns">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="h-7 w-44 bg-slate-200/90 rounded-lg animate-pulse" />
          <div className="h-3.5 w-60 max-w-[70vw] bg-slate-100 rounded animate-pulse" />
        </div>
        <div className="h-11 w-11 md:w-36 bg-[var(--violet-border,#E9D5FF)]/60 rounded-xl animate-pulse" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {[72, 64, 56, 64].map((w, i) => <div key={i} className="h-9 rounded-full bg-slate-200/70 animate-pulse shrink-0" style={{ width: w }} />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="bg-white rounded-[20px] border border-slate-200/80 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-slate-200 animate-pulse shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-2/3 bg-slate-200 rounded animate-pulse" />
                <div className="h-2.5 w-1/3 bg-slate-100 rounded animate-pulse" />
              </div>
              <div className="h-6 w-16 rounded-full bg-slate-100 animate-pulse" />
            </div>
            <div className="h-3 w-full bg-slate-100 rounded animate-pulse" />
            <div className="h-3 w-4/5 bg-slate-100 rounded animate-pulse" />
            <div className="grid grid-cols-2 gap-2">
              <div className="h-11 rounded-xl bg-slate-50 border border-slate-100" />
              <div className="h-11 rounded-xl bg-slate-50 border border-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Brand payments (phone): hero card, two tiles, filter chips, rows — same shape as BrandPaymentsMobile. */
export function BrandPaymentsSkeleton() {
  return <CreatorEarningsSkeleton />;
}
