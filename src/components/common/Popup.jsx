import React, { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import useBackToClose from "../../lib/popupRules";
import { motion, AnimatePresence, useDragControls, useIsPresent } from "framer-motion";
import { backdropMotion, panelMotion, isSheetViewport, shouldCloseSheet } from "../../lib/motion";
import { lockScroll, unlockScroll } from "../../lib/useScrollLock";

// Session 37 — building blocks so every popup opens and closes the same way.
//
//   <Presence>{open && (
//     <PopupBackdrop className="fixed inset-0 bg-black/50 flex items-end sm:items-center" onClick={close}>
//       <PopupPanel kind="auto" below={640} onClose={close} className="...">…</PopupPanel>
//     </PopupBackdrop>
//   )}</Presence>
//
// kind: "sheet" (phone bottom sheet) · "modal" (centered popup) · "auto" (sheet under
// `below` px, popup above) · "drawer" (from the right) · "fade".
// A sheet with onClose can be dragged down by its top edge to close, like big apps.
// These only change how things move — what the popup shows and does stays in the screen.

// `propagate`: when a screen hides a popup that itself uses <Presence>, the inner one still
// plays its closing animation instead of vanishing.
export function Presence({ children, ...props }) {
  return <AnimatePresence propagate {...props}>{children}</AnimatePresence>;
}

// v360 (Ravi's screenshot: "Cancel brief" buttons hidden under the bottom bar): the phone bottom nav is z-50, the
// same as most full-screen popups, so the nav painted over their buttons. A full-screen backdrop that asks for
// z-40 / z-50 now sits at 1000 — above the nav and the Eva bubble, below toasts.
const LOW_Z = /(^|\s)z-(40|50|\[50\]|\[60\])(\s|$)/;
export const PopupBackdrop = forwardRef(function PopupBackdrop({ children, className = "", style, ...props }, ref) {
  const lift = /(^|\s)fixed(\s|$)/.test(className) && /(^|\s)inset-0(\s|$)/.test(className) && LOW_Z.test(className) && !(style && style.zIndex != null);
  return (
    <motion.div ref={ref} {...backdropMotion} className={className} style={lift ? { ...(style || {}), zIndex: 1000 } : style} {...props}>
      {children}
    </motion.div>
  );
});

const POSITIONED = /(^|\s)(absolute|fixed|relative|sticky)(\s|$)/;

// v415: open popups, newest last — only the top one reacts to Escape. A popup drawn inside another one is
// above it even when both open together (React runs the inner one's effect first).
const openStack = []; // { id, node }
let nextId = 1;
function topPopupId() {
  const inner = openStack.filter((a) => !openStack.some((b) => b !== a && a.node && b.node && a.node.contains(b.node)));
  return inner.length ? inner[inner.length - 1].id : null;
}

export const PopupPanel = forwardRef(function PopupPanel(
  // v415: closeOnEscape (default on; pass false e.g. while saving) · modal (default on, off for kind="fade"
  // menus): locks the page behind (shared counter with useScrollLock, so nested popups and screens that
  // already lock keep working), role="dialog" + aria-modal, focus into the panel and back to the opener.
  { kind = "auto", below = 768, onClose, drag = true, as = "div", className = "", style, children, closeOnEscape = true, modal, ...props },
  ref
) {
  const isModal = modal ?? kind !== "fade";
  const present = useIsPresent();
  const localRef = useRef(null);
  const setRefs = useCallback((node) => {
    localRef.current = node;
    if (typeof ref === "function") ref(node); else if (ref) ref.current = node;
  }, [ref]);
  const [id] = useState(() => nextId++);
  // v415: remember who had focus before the popup drew (an autoFocus field inside would hide it later).
  const [opener] = useState(() => (typeof document !== "undefined" ? document.activeElement : null));
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const escRef = useRef(closeOnEscape);
  escRef.current = closeOnEscape;
  // v426: phone Back closes the popup instead of leaving the page (see lib/useBackToClose).
  useBackToClose(isModal && present && typeof onClose === "function", () => { if (escRef.current !== false) closeRef.current?.(); });
  const presentRef = useRef(present);
  presentRef.current = present;

  // v415: page behind doesn't scroll while the popup is on screen (incl. its closing animation).
  useEffect(() => {
    if (!isModal) return undefined;
    lockScroll();
    return () => unlockScroll();
  }, [isModal]);

  // v415: focus goes into the popup on open (unless something inside already took it, e.g. autoFocus),
  // and back to the button that opened it when it goes away.
  useEffect(() => {
    if (!isModal || typeof document === "undefined") return undefined;
    const node = localRef.current;
    if (node && !node.contains(document.activeElement)) {
      try { node.focus({ preventScroll: true }); } catch { /* old browser */ }
    }
    return () => {
      const now = document.activeElement;
      const lost = !now || now === document.body || (node && node.contains(now));
      if (lost && opener && opener !== document.body && typeof opener.focus === "function" && document.contains(opener)) {
        try { opener.focus({ preventScroll: true }); } catch { /* old browser */ }
      }
    };
  }, [isModal, opener]);

  // v415: track which popup is on top; a closing one steps aside at once.
  useEffect(() => {
    if (!present) return undefined;
    const entry = { id, node: localRef.current };
    openStack.push(entry);
    return () => { const i = openStack.indexOf(entry); if (i !== -1) openStack.splice(i, 1); };
  }, [id, present]);

  // v415: Escape closes the top popup. Runs a tick later and only if the popup is still open, so screens
  // that already close on Escape themselves don't get a second onClose.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (topPopupId() !== id) return;
      if (!escRef.current || typeof closeRef.current !== "function") return;
      setTimeout(() => {
        if (!alive || !presentRef.current || !escRef.current || typeof closeRef.current !== "function") return;
        closeRef.current();
      }, 0);
    };
    let alive = true;
    window.addEventListener("keydown", onKey);
    return () => { alive = false; window.removeEventListener("keydown", onKey); };
  }, [id]);

  // Decide once, so the popup leaves the same way it came in even if the window resizes.
  const [motionProps] = useState(() => panelMotion(kind, below));
  const [isSheet] = useState(() => kind === "sheet" || (kind === "auto" && isSheetViewport(below)));
  const controls = useDragControls();
  const canDrag = isSheet && drag && typeof onClose === "function";

  const Comp = as === "form" ? motion.form : motion.div;
  const needsPosition = canDrag && !POSITIONED.test(className) && !(style && style.position);

  return (
    <Comp
      ref={setRefs}
      {...(isModal ? { role: "dialog", "aria-modal": "true", tabIndex: -1 } : {})}
      {...motionProps}
      {...(canDrag
        ? {
            drag: "y",
            dragControls: controls,
            dragListener: false,
            dragConstraints: { top: 0, bottom: 0 },
            dragElastic: { top: 0, bottom: 0.7 },
            dragMomentum: false,
            onDragEnd: (_e, info) => { if (shouldCloseSheet(info)) onClose(); },
          }
        : {})}
      className={`${className}${needsPosition ? " relative" : ""}`}
      style={isModal ? { outline: "none", ...(style || {}) } : style}
      data-sheet={isSheet ? "1" : undefined}
      {...props}
    >
      {canDrag && (
        // Invisible grab strip along the top edge (leaves the corners free for back / close buttons).
        <div
          aria-hidden="true"
          data-testid="sheet-grip"
          onPointerDown={(e) => controls.start(e)}
          style={{ position: "absolute", top: 0, left: 56, right: 56, height: 26, touchAction: "none", cursor: "grab", zIndex: 2 }}
        />
      )}
      {children}
    </Comp>
  );
});

// v430 (theme): the app's own "Are you sure?" sheet instead of the phone's grey browser box (window.confirm).
//   if (!(await appConfirm("Remove this?", { ok: "Remove", danger: true }))) return;
// Resolves true / false. Falls back to window.confirm only if the page can't draw it.
function ConfirmSheet({ message, ok, cancel, danger, done }) {
  const [open, setOpen] = useState(true);
  const finish = (v) => { setOpen(false); setTimeout(() => done(v), 180); };
  return (
    <Presence>{open && (
      <PopupBackdrop className="fixed inset-0 z-[3000] bg-black/50 flex items-end sm:items-center justify-center" onClick={() => finish(false)}>
        <PopupPanel kind="auto" below={640} onClose={() => finish(false)} onClick={(e) => e.stopPropagation()}
          className="w-full sm:max-w-[400px] bg-white rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(20px+env(safe-area-inset-bottom))] font-['DM_Sans',sans-serif]" data-testid="app-confirm">
          <div className="text-[16px] font-bold text-[#0A0A0A] leading-snug whitespace-pre-line">{message}</div>
          <div className="mt-5 flex gap-2.5">
            <button type="button" onClick={() => finish(false)} className="flex-1 h-12 rounded-2xl bg-white border border-[#E5E5EA] text-[#0A0A0A] text-[15px] font-bold" data-testid="app-confirm-cancel">{cancel}</button>
            <button type="button" onClick={() => finish(true)} autoFocus className={`flex-1 h-12 rounded-2xl text-white text-[15px] font-bold ${danger ? "bg-[#DC2626]" : "bg-[#7C3AED]"}`} data-testid="app-confirm-ok">{ok}</button>
          </div>
        </PopupPanel>
      </PopupBackdrop>
    )}</Presence>
  );
}
export function appConfirm(message, { ok = "Yes", cancel = "Cancel", danger = false } = {}) {
  if (typeof document === "undefined") return Promise.resolve(false);
  return import("react-dom/client").then(({ createRoot }) => new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (v) => { resolve(v); setTimeout(() => { try { root.unmount(); host.remove(); } catch { /* gone */ } }, 0); };
    root.render(<ConfirmSheet message={message} ok={ok} cancel={cancel} danger={danger} done={done} />);
  })).catch(() => (typeof window !== "undefined" ? window.confirm(message) : false));
}
