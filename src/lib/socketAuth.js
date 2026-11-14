import { safeStorage } from "../utils/storage";

// The server ties each socket to the logged-in user (backend/socketAccess.ts). Without the
// token a socket gets no user room and cannot join any deal's chat room.
// A function, so a reconnect after login/logout always sends the current token.
export const socketAuth = (cb) => cb({ token: safeStorage.getItem("ybex_token") || "" });
