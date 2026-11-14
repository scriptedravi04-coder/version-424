// Session 31 (speed): each part of a page (bell, popup, inbox, dashboard, chat list) opened its own
// socket.io connection — 3–4 per tab, each with its own handshake and server room. They now share ONE
// connection per tab. Each user takes a "lease": its listeners are removed when it releases, and the
// connection closes 2 s after the last lease is released (so moving between pages does not reconnect).
// Session 36: the open chat thread (desktop + mobile) and the UGC order screens use it too (Ravi's OK).
import { io } from "socket.io-client";
import { socketAuth } from "./socketAuth";
import { serverOrigin } from "./native";

let socket = null;
let ownerId = null;
let leases = 0;
let closeTimer = null;

function open(userId) {
  // Session 36: a screen that does not know the user id (userId null) reuses whatever connection is
  // open — the server identifies the user from socketAuth, not from this id. A known id that differs
  // from the owner means a different account in this tab: never reuse that connection.
  if (socket && userId != null && ownerId != null && ownerId !== userId) {
    socket.disconnect();
    socket = null;
  }
  if (socket && userId != null && ownerId == null) ownerId = userId;
  if (!socket) {
    socket = io(serverOrigin(), /* v335: live server inside the iPhone app */ { auth: socketAuth, transports: ["websocket", "polling"], tryAllTransports: true });
    ownerId = userId;
  }
  return socket;
}

/**
 * const lease = acquireSocket(userId);
 * lease.on("new_notification", fn); lease.onConnect(() => lease.emit("register_user", userId));
 * return () => lease.release();
 */
export function acquireSocket(userId = null) {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  const s = open(userId);
  leases++;
  const mine = [];
  let released = false;
  const lease = {
    socket: s,
    on(event, fn) { s.on(event, fn); mine.push([event, fn]); return lease; },
    /** Runs now if already connected, and again after every reconnect. */
    onConnect(fn) { if (s.connected) fn(); return lease.on("connect", fn); },
    emit(...args) { s.emit(...args); return lease; },
    release() {
      if (released) return;
      released = true;
      for (const [event, fn] of mine) s.off(event, fn);
      leases = Math.max(0, leases - 1);
      if (leases === 0) {
        closeTimer = setTimeout(() => {
          closeTimer = null;
          if (leases === 0 && socket) { socket.disconnect(); socket = null; ownerId = null; }
        }, 2000);
      }
    },
  };
  return lease;
}

/** Test helper. */
export function _sharedSocketState() {
  return { open: Boolean(socket), leases };
}
