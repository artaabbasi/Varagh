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
import { GameRunner } from "../rooms/game-runner";

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
  roomStore: RoomStore,
  gameRunner: GameRunner,
): void {
  type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

  io.on("connection", (socket: AppSocket) => {
    socket.data = { userId: null, nickname: null, discriminator: null, currentRoomCode: null };

    // ── Auth ──────────────────────────────────────────────────────────────

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
        // Join a personal Socket.IO room so game:stateUpdate can reach this
        // socket by userId regardless of room membership.
        void socket.join(user.id);
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
      void socket.join(user.id);
      cb({ ok: true, user });
    });

    // ── Room lifecycle ────────────────────────────────────────────────────

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

      // If the room is already in progress this is a reconnect — restore the
      // player's view and cancel their grace timer.
      if (room.phase === "playing") {
        gameRunner.handleReconnect(room.code, socket.data.userId);
      }

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

    // ── Game ──────────────────────────────────────────────────────────────

    socket.on("game:start", (_, cb) => {
      const { userId, currentRoomCode } = socket.data;
      if (!userId || !currentRoomCode) return cb({ ok: false, error: "Not authenticated" });
      const room = roomStore.get(currentRoomCode);
      if (!room) return cb({ ok: false, error: "Room not found" });
      if (room.hostPlayerId !== userId) return cb({ ok: false, error: "Only the host can start" });

      const result = gameRunner.startGame(room);
      if (!result.ok) return cb({ ok: false, error: result.error });

      // Notify lobby that the room is no longer joinable.
      io.to(room.code).emit("room:updated", toRoomView(room));
      cb({ ok: true });
    });

    socket.on("game:move", ({ move }, cb) => {
      const { userId, currentRoomCode } = socket.data;
      if (!userId || !currentRoomCode) return cb({ ok: false, error: "Not authenticated" });
      const room = roomStore.get(currentRoomCode);
      if (!room || room.phase !== "playing") return cb({ ok: false, error: "Not in a game" });

      const result = gameRunner.applyPlayerMove(room, userId, move);
      if (!result.ok) return cb({ ok: false, error: result.error });
      cb({ ok: true });
    });

    // ── Disconnect ────────────────────────────────────────────────────────

    socket.on("disconnect", () => {
      const { userId, currentRoomCode } = socket.data;
      if (!userId || !currentRoomCode) return;
      roomStore.setConnected(currentRoomCode, userId, false);
      const room = roomStore.get(currentRoomCode);
      if (!room) return;
      io.to(currentRoomCode).emit("room:updated", toRoomView(room));
      if (room.phase === "playing") {
        gameRunner.handleDisconnect(currentRoomCode, userId);
      }
    });
  });
}
