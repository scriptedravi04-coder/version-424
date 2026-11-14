// Socket.IO wiring: who a socket is, which rooms it may join, and who sees online status.
// Moved out of server.ts (session 22) — behaviour unchanged. The access rules themselves are
// in backend/socketAccess.ts.
import { logIgnored } from "./logIgnored";
import { createSocketAccess, registerSocketAccess, actingIds, isStaffUser, ADMIN_ROOM } from "./socketAccess";

export function attachSocketServer(
  io: any,
  deps: { parseAuthUser: (req: any) => Promise<any>; getDb: () => any; getClient: () => any }
) {
  // Track which userId(s) are currently connected (a user can have multiple
  // tabs/sockets open at once, so we keep a Set of socket ids per userId).
  const onlineUsersMap = new Map<string, Set<string>>();

  // Sockets are tied to the logged-in user (see backend/socketAccess.ts for what this replaced).
  const socketAccess = createSocketAccess({
    parseAuthUser: deps.parseAuthUser,
    getDb: deps.getDb,
    getClient: deps.getClient
  });
  registerSocketAccess(socketAccess);

  const joinOwnRooms = (socket: any, user: any) => {
    for (const id of actingIds(user)) socket.join(`user_${id}`);
    if (isStaffUser(user)) socket.join(ADMIN_ROOM);
  };

  io.on("connection", (socket: any) => {
    // Resolve the user once per socket and put it in its own rooms straight away, so pages that
    // only listen (inbox, order lists, notification bell) get their events without asking.
    const ready = socketAccess.userForSocket(socket).then((user) => {
      if (user) joinOwnRooms(socket, user);
      return user;
    });

    // The id argument is ignored: it used to join the room of whatever id the client sent.
    socket.on("register_user", async () => {
      const user = await ready;
      if (!user) return;
      const userId = String(user.user_id);
      socket.data.userId = userId;
      joinOwnRooms(socket, user);
      if (!onlineUsersMap.has(userId)) onlineUsersMap.set(userId, new Set());
      onlineUsersMap.get(userId)!.add(socket.id);
      socket.data.statusUser = user;
      socketAccess.emitStatus(io, user, "online").catch((e: any) => logIgnored("socket.status.online", e));
    });

    // Only a party of the deal (or staff) may listen to a deal's room.
    socket.on("join_room", async (roomId: string) => {
      if (!roomId) return;
      const user = await ready;
      if (await socketAccess.canJoinThread(user, roomId)) {
        socket.join(roomId);
      } else {
        socket.emit("room_denied", { roomId });
      }
    });

    socket.on("leave_room", (roomId: string) => {
      if (roomId) socket.leave(roomId);
    });

    // Used to return every online user id on the platform to anyone who asked.
    socket.on("get_online_users", async () => {
      const user = await ready;
      socket.emit("online_users_list", await socketAccess.visibleOnline(user, Array.from(onlineUsersMap.keys())));
    });

    socket.on("disconnect", () => {
      const userId = socket.data.userId;
      if (userId && onlineUsersMap.has(userId)) {
        const sockets = onlineUsersMap.get(userId)!;
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsersMap.delete(userId);
          socketAccess.emitStatus(io, socket.data.statusUser || { user_id: userId }, "offline").catch((e: any) => logIgnored("socket.status.offline", e));
        }
      }
    });
  });

  return { socketAccess, onlineUsersMap };
}
