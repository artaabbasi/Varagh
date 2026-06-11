import type { Server, Socket } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  RoomView,
} from "@varagh/shared";
import type { AuthStore } from "../auth/store";
import type { Room } from "../rooms/room";
import { signup, login } from "../auth/auth";
import { RoomStore } from "../rooms/room-store";
import { toLobbyEntry } from "../rooms/lobby";

// 2–20 chars: Persian letters, Latin letters, digits, spaces
const NICKNAME_RE = /^[؀-ۿa-zA-Z0-9 ]{2,20}$/;

function toRoomView(room: Room): RoomView {
  return {
    code: room.code,
    gameId: room.gameId,
    variantId: room.variantId,
    options: room.options,
    isPublic: room.isPublic,
    phase: room.phase,
    seats: room.seats.map((s) => ({
      playerId: s.playerId,
      nickname: s.nickname,
      discriminator: s.discriminator,
      connected: s.connected,
      isHost: s.playerId === room.hostPlayerId,
    })),
  };
}

export function registerHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>,
  authStore: AuthStore,
  roomStore: RoomStore
): void {
  type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
  io.on("connection", (socket: AppSocket) => {
    socket.data = { userId: null, nickname: null, discriminator: null, currentRoomCode: null };

    socket.on("auth:signup", ({ nickname }, cb) => {
      const trimmed = nickname.trim();
      if (!NICKNAME_RE.test(trimmed)) {
        return cb({ ok: false, error: "Invalid nickname" });
      }
      try {
        const { token, user } = signup(authStore, trimmed);
        socket.data.userId = user.id;
        socket.data.nickname = user.nickname;
        socket.data.discriminator = user.discriminator;
        cb({ ok: true, token, user });
      } catch {
        cb({ ok: false, error: "Signup failed" });
      }
    });

    socket.on("auth:login", ({ token }, cb) => {
      const user = login(authStore, token);
      if (!user) return cb({ ok: false, error: "Invalid token" });
      socket.data.userId = user.id;
      socket.data.nickname = user.nickname;
      socket.data.discriminator = user.discriminator;
      cb({ ok: true, user });
    });

    socket.on("room:create", ({ gameId, variantId, options, isPublic }, cb) => {
      if (!socket.data.userId) return cb({ ok: false, error: "Not authenticated" });
      const room = roomStore.create({
        gameId,
        variantId,
        options,
        isPublic,
        host: {
          playerId: socket.data.userId,
          nickname: socket.data.nickname!,
          discriminator: socket.data.discriminator!,
          connected: true,
        },
      });
      socket.data.currentRoomCode = room.code;
      void socket.join(room.code);
      cb({ ok: true, joinCode: room.code, room: toRoomView(room) });
    });

    socket.on("room:join", ({ joinCode }, cb) => {
      if (!socket.data.userId) return cb({ ok: false, error: "Not authenticated" });
      const room = roomStore.join(joinCode.toUpperCase(), {
        playerId: socket.data.userId,
        nickname: socket.data.nickname!,
        discriminator: socket.data.discriminator!,
        connected: true,
      });
      if (!room) return cb({ ok: false, error: "Room not found or already started" });
      socket.data.currentRoomCode = room.code;
      void socket.join(room.code);
      io.to(room.code).emit("room:updated", toRoomView(room));
      cb({ ok: true, room: toRoomView(room) });
    });

    socket.on("room:leave", (_, cb) => {
      const { userId, currentRoomCode } = socket.data;
      if (!currentRoomCode || !userId) return cb({ ok: false, error: "Not in a room" });
      const remaining = roomStore.leave(currentRoomCode, userId);
      void socket.leave(currentRoomCode);
      socket.data.currentRoomCode = null;
      if (remaining) io.to(remaining.code).emit("room:updated", toRoomView(remaining));
      cb({ ok: true });
    });

    socket.on("room:list", (_, cb) => {
      cb({ ok: true, rooms: roomStore.listPublic().map(toLobbyEntry) });
    });

    socket.on("disconnect", () => {
      const { userId, currentRoomCode } = socket.data;
      if (!userId || !currentRoomCode) return;
      roomStore.setConnected(currentRoomCode, userId, false);
      const room = roomStore.get(currentRoomCode);
      if (room) io.to(currentRoomCode).emit("room:updated", toRoomView(room));
    });
  });
}
