import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowDown, Check } from "lucide-react";

/**
 * Native-feeling Pull-To-Refresh component for mobile feeds.
 * Supports touch gestures, momentum damping, haptic feedback,
 * dynamic progress ring, and smooth collaboration sync states.
 */
export default function PullToRefresh({
  children,
  onRefresh,
  isRefreshing: externalIsRefreshing,
  pullDownThreshold = 72,
  maxPull = 120,
  refreshingHeight = 56,
  pullingText = "Pull to refresh",
  releaseText = "Release to update",
  refreshingText = "Updating collaborations...",
  successText = "Latest collaborations synced",
  lastUpdatedText,
  disabled = false,
  className = "",
  contentClassName = "",
}) {
  const [internalRefreshing, setInternalRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isSuccess, setIsSuccess] = useState(false);
  const [hasVibratedThreshold, setHasVibratedThreshold] = useState(false);

  const containerRef = useRef(null);
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const isPullingRef = useRef(false);
  const isDraggingRef = useRef(false);
  // Session 43 (Ravi: "scroll karte hue lag, phir stuck, upar-neeche ulta scroll"):
  //  • React's touchmove listener is passive, so preventDefault() never worked — the page's own
  //    scroll / iPhone bounce ran at the same time as our pull, and the two fought (feels reversed).
  //    The touch listeners are now real, non-passive listeners on the box.
  //  • touch-action switched to "none" while pullDistance > 0 — that includes the whole refresh, so
  //    the page could not be scrolled at all for that time ("stuck"). It now stays pan-y always.
  //  • A pull starts only at the very top (scrollTop 0) and after 8 px of clear downward movement,
  //    so a normal scroll that begins with a tiny wobble never moves the page.
  //  • Pointer handlers are for a mouse only (on a phone they ran in parallel with the touch ones).
  const pullRef = useRef(0);
  const busyRef = useRef(false);
  const vibratedRef = useRef(false);
  const latest = useRef({});
  const DEAD_ZONE = 8;

  const isRefreshing = externalIsRefreshing !== undefined ? externalIsRefreshing : internalRefreshing;
  busyRef.current = Boolean(isRefreshing || isSuccess);

  const setPull = useCallback((v) => {
    if (pullRef.current === v) return;
    pullRef.current = v;
    setPullDistance(v);
  }, []);

  // Safe haptic feedback trigger
  const triggerHaptic = useCallback((pattern = 12) => {
    try {
      if (typeof window !== "undefined" && "navigator" in window && typeof window.navigator.vibrate === "function") {
        window.navigator.vibrate(pattern);
      }
    } catch {
      // Ignore vibration errors on unsupported devices
    }
  }, []);

  // At the very top of every scroller that could move this page?
  const isAtTop = useCallback(() => {
    const appScroller = document.getElementById("app-scroll-container");
    if (appScroller && appScroller.scrollTop > 0) return false;
    const windowScrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    if (windowScrollTop > 0) return false;
    if (containerRef.current && containerRef.current.scrollTop > 0) return false;
    return true;
  }, []);

  const begin = (x, y) => {
    startYRef.current = y;
    startXRef.current = x;
    isPullingRef.current = true;
    vibratedRef.current = false;
    setHasVibratedThreshold(false);
  };

  // Returns true when this move is a pull (the caller then blocks the page's own scroll).
  const move = (x, y) => {
    if (!isPullingRef.current || disabled || busyRef.current) return false;
    const deltaY = y - startYRef.current;
    const deltaX = x - startXRef.current;
    if (deltaY <= 0 || Math.abs(deltaX) > deltaY) {
      // Finger went up (normal scroll) or sideways: this gesture is not a pull any more.
      if (pullRef.current === 0) isPullingRef.current = false;
      setPull(0);
      return false;
    }
    if (pullRef.current === 0 && (deltaY < DEAD_ZONE || !isAtTop())) {
      if (!isAtTop()) isPullingRef.current = false;
      return false;
    }
    const pulled = Math.max(0, deltaY - DEAD_ZONE);
    const damped = Math.min(maxPull, Math.pow(pulled, 0.82) * 1.7);
    setPull(damped);
    if (damped >= pullDownThreshold && !vibratedRef.current) {
      triggerHaptic(14);
      vibratedRef.current = true;
      setHasVibratedThreshold(true);
    } else if (damped < pullDownThreshold && vibratedRef.current) {
      vibratedRef.current = false;
      setHasVibratedThreshold(false);
    }
    return true;
  };

  // Handle Touch End / Cancel (also the mouse release)
  const handleTouchEnd = useCallback(async () => {
    const wasPulling = isPullingRef.current || isDraggingRef.current;
    isPullingRef.current = false;
    isDraggingRef.current = false;
    if (!wasPulling && pullRef.current === 0) return;
    const { pullDownThreshold: th, refreshingHeight: rh, onRefresh: cb } = latest.current;

    if (pullRef.current >= th && !busyRef.current) {
      busyRef.current = true;
      triggerHaptic([8, 25, 8]);
      setInternalRefreshing(true);
      setPull(rh);
      try {
        if (typeof cb === "function") await cb();
      } catch (err) {
        console.warn("[PullToRefresh] Error executing onRefresh:", err);
      } finally {
        setIsSuccess(true);
        triggerHaptic(18);
        setTimeout(() => {
          setIsSuccess(false);
          setInternalRefreshing(false);
          setPull(0);
        }, 600);
      }
    } else if (!busyRef.current) {
      setPull(0); // snap back
    }
  }, [setPull, triggerHaptic]);
  latest.current = { pullDownThreshold, refreshingHeight, onRefresh, handleTouchEnd };

  // Native, non-passive touch listeners (see the note at the top).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const onStart = (e) => {
      if (disabled || busyRef.current) return;
      const t = e.touches && e.touches[0];
      if (!t || e.touches.length > 1 || !isAtTop()) { isPullingRef.current = false; return; }
      begin(t.clientX, t.clientY);
    };
    const onMove = (e) => {
      const t = e.touches && e.touches[0];
      if (!t) return;
      if (move(t.clientX, t.clientY) && e.cancelable) e.preventDefault();
    };
    const onEnd = () => latest.current.handleTouchEnd();
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, maxPull, isAtTop]);

  // Mouse drag (desktop preview only — a phone uses the touch listeners above)
  const handlePointerDown = (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    if (disabled || busyRef.current || !isAtTop()) return;
    isDraggingRef.current = true;
    begin(e.clientX, e.clientY);
  };
  const handlePointerMove = (e) => {
    if (e.pointerType !== "mouse" || !isDraggingRef.current) return;
    move(e.clientX, e.clientY);
  };
  const handlePointerUp = (e) => {
    if (e && e.pointerType && e.pointerType !== "mouse") return;
    if (isDraggingRef.current) handleTouchEnd();
  };

  // A mouse released outside the box still ends the drag.
  useEffect(() => {
    const onUp = (e) => { if (isDraggingRef.current && (!e.pointerType || e.pointerType === "mouse")) handleTouchEnd(); };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [handleTouchEnd]);

  // Sync external refreshing prop changes so pullDistance never gets stuck
  useEffect(() => {
    if (!isRefreshing && !isSuccess && !isPullingRef.current && !isDraggingRef.current) {
      setPull(0);
    }
  }, [isRefreshing, isSuccess, setPull]);

  // Auto-recovery safeguard: never stay stuck down if a network request hangs
  useEffect(() => {
    let safetyTimer = null;
    if (pullDistance > 0 || isRefreshing) {
      safetyTimer = setTimeout(() => {
        if (isPullingRef.current || isDraggingRef.current) return;
        setPull(0);
        setInternalRefreshing(false);
        setIsSuccess(false);
      }, 5000);
    }
    return () => {
      if (safetyTimer) clearTimeout(safetyTimer);
    };
  }, [pullDistance, isRefreshing, setPull]);

  // Pull progress ratio (0 to 1)
  const pullRatio = Math.min(1, Math.max(0, pullDistance / pullDownThreshold));
  const isReadyToRelease = pullDistance >= pullDownThreshold;

  // Active displayed distance (with spring ease during refresh)
  const displayDistance = isRefreshing || isSuccess ? refreshingHeight : pullDistance;

  // Calculate SVG stroke offset for the circular progress ring
  const circleRadius = 9;
  const circumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset = circumference - pullRatio * circumference;

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-x-hidden ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{ touchAction: "pan-y" }}
    >
      {/* Floating Native-Style Refresh Indicator */}
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 z-40 flex justify-center items-start overflow-visible"
        style={{
          transform: `translateY(${Math.max(10, displayDistance * 0.45)}px)`,
          opacity: displayDistance > 8 ? Math.min(1, displayDistance / 32) : 0,
          transition: isPullingRef.current || isDraggingRef.current ? "opacity 75ms linear" : "all 300ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div
          className={`px-3.5 py-1.5 rounded-full shadow-lg border flex items-center gap-2 transition-all duration-200 ${
            isSuccess
              ? "bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46] shadow-emerald-500/10"
              : isReadyToRelease || isRefreshing
              ? "bg-white/95 border-[#DDD6FE] text-[#7C3AED] shadow-[0_8px_20px_rgba(124,58,237,0.15)]"
              : "bg-white/95 border-gray-200 text-gray-700 shadow-sm"
          }`}
        >
          {isSuccess ? (
            /* Success State */
            <>
              <div className="w-5 h-5 rounded-full bg-[#059669] flex items-center justify-center text-white shrink-0">
                <Check size={12} strokeWidth={3} />
              </div>
              <span className="text-[11.5px] font-semibold tracking-tight">{successText}</span>
            </>
          ) : isRefreshing ? (
            /* Refreshing Active State */
            <>
              <div className="relative w-5 h-5 flex items-center justify-center shrink-0">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.85, repeat: Infinity, ease: "linear" }}
                  className="w-5 h-5 border-2 border-[var(--violet)]/20 border-t-[var(--violet)] rounded-full"
                />
                              </div>
              <span className="text-[11.5px] font-semibold text-[var(--violet)] tracking-tight">
                {refreshingText}
              </span>
            </>
          ) : (
            /* Pulling Down / Ready to Release State */
            <>
              <div className="relative w-5 h-5 flex items-center justify-center shrink-0">
                {/* Background Ring */}
                <svg className="w-5 h-5 -rotate-90" viewBox="0 0 24 24">
                  <circle
                    cx="12"
                    cy="12"
                    r={circleRadius}
                    fill="none"
                    stroke="#E5E7EB"
                    strokeWidth="2.5"
                  />
                  <circle
                    cx="12"
                    cy="12"
                    r={circleRadius}
                    fill="none"
                    stroke="#7C3AED"
                    strokeWidth="2.5"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className="transition-all duration-75"
                  />
                </svg>
                {/* Center Arrow with dynamic rotation */}
                <ArrowDown
                  size={10}
                  strokeWidth={2.5}
                  className={`absolute text-gray-600 transition-transform duration-200 ${
                    isReadyToRelease ? "rotate-180 text-[var(--violet)]" : ""
                  }`}
                  style={{ transform: `rotate(${isReadyToRelease ? 180 : pullRatio * 180}deg)` }}
                />
              </div>
              <div className="flex flex-col">
                <span className={`text-[11.5px] font-semibold tracking-tight ${isReadyToRelease ? "text-[var(--violet)]" : "text-gray-700"}`}>
                  {isReadyToRelease ? releaseText : pullingText}
                </span>
                {lastUpdatedText && !isReadyToRelease && (
                  <span className="text-[11px] text-gray-500 font-medium -mt-0.5">{lastUpdatedText}</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Feed Content with smooth translation when pulled */}
      <div
        className={`w-full transition-transform ease-out duration-150 ${contentClassName}`}
        style={{
          // Session 29: no transform at rest. Even translate3d(0,0,0) makes this box the frame
          // for every "fixed" child, so modals on the dashboard covered only part of the screen.
          transform: displayDistance > 0 ? `translate3d(0, ${displayDistance}px, 0)` : "none",
          transitionDuration: isPullingRef.current || isDraggingRef.current ? "0ms" : "250ms",
        }}
      >
        {children}
      </div>
    </div>
  );
}
