import type { Server, Socket } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  RoomView,
} from "@varagh/shared";
import type { AuthStore } from "../auth/store";
import type { Room } from "../rooms/room";
import { signup, login, loginWithPassword } from "../auth/auth";
import { RoomStore } from "../rooms/room-store";
import { toLobbyEntry } from "../rooms/lobby";
import { GameRunner } from "../rooms/game-runner";

// 2–20 chars: Persian letters, Latin letters, digits, spaces
const NICKNAME_RE = /^[؀-ۿa-zA-Z0-9 ]{2,20}$/;
const PASSWORD_MIN = 4;

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

    socket.on("auth:signup", ({ nickname, password }, cb) => {
      const trimmed = nickname.trim();
      if (!NICKNAME_RE.test(trimmed)) {
        return cb({ ok: false, error: "Invalid nickname" });
      }
      if (password !== undefined && password.length < PASSWORD_MIN) {
        return cb({ ok: false, error: `Password must be at least ${PASSWORD_MIN} characters` });
      }
      try {
        const { token, user } = signup(authStore, trimmed, password);
        socket.data.userId = user.id;
        socket.data.nickname = user.nickname;
        socket.data.discriminator = user.discriminator;
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

    socket.on("auth:loginWithPassword", ({ nickname, password }, cb) => {
      const result = loginWithPassword(authStore, nickname.trim(), password);
      if (!result) return cb({ ok: false, error: "Invalid nickname or password" });
      const { token, user } = result;
      socket.data.userId = user.id;
      socket.data.nickname = user.nickname;
      socket.data.discriminator = user.discriminator;
      void socket.join(user.id);
      cb({ ok: true, token, user });
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

      if (room.phase === "playing") {
        gameRunner.handleReconnect(room.code, socket.data.userId);
      }

      io.to(room.code).emit("room:updated", toRoomView(room));
      cb({ ok: true, room: toRoomView(room) });
    });

    socket.on("room:leave", (_, cb) => {
      const { userId, currentRoomCode, nickname } = socket.data;
      if (!currentRoomCode || !userId) return cb({ ok: false, error: "Not in a room" });

      // Leaving a game in progress ends it for everyone — there is no
      // meaningful way to continue a trick-taking hand a seat short.
      const room = roomStore.get(currentRoomCode);
      const endedGame = room?.phase === "playing";
      if (endedGame && room) {
        gameRunner.abortGame(room);
        io.to(room.code).emit("game:aborted", { reason: "playerLeft", by: nickname });
      }

      const remaining = roomStore.leave(currentRoomCode, userId);
      void socket.leave(currentRoomCode);
      socket.data.currentRoomCode = null;
      // When the game was aborted the remaining players are being sent to the
      // lobby, so a room:updated would be redundant noise.
      if (remaining && !endedGame) io.to(remaining.code).emit("room:updated", toRoomView(remaining));
      cb({ ok: true });
    });

    socket.on("room:list", (_, cb) => {
      cb({ ok: true, rooms: roomStore.listPublic().map(toLobbyEntry) });
    });

    socket.on("lobby:getStats", (_, cb) => {
      const onlineCount = io.sockets.sockets.size;
      const { activeGames, publicRooms } = roomStore.getStats();
      const totalUsers = authStore.getTotalUsers();
      cb({ ok: true, stats: { onlineCount, activeGames, publicRooms, totalUsers } });
    });

    socket.on("user:getHistory", (_, cb) => {
      const { userId } = socket.data;
      if (!userId) return cb({ ok: false, error: "Not authenticated" });
      const matches = authStore.getUserHistory(userId);
      cb({ ok: true, matches });
    });

    socket.on("user:getActiveRooms", (_, cb) => {
      const { userId } = socket.data;
      if (!userId) return cb({ ok: true, rooms: [] });
      const rooms = roomStore.getActiveRoomsForUser(userId).map((r) => ({
        code: r.code,
        gameId: r.gameId,
        variantId: r.variantId,
        phase: r.phase,
        playerCount: r.seats.length,
      }));
      cb({ ok: true, rooms });
    });

    // ── Friends ──────────────────────────────────────────────────────────

    socket.on("friend:add", ({ nickname, discriminator }, cb) => {
      const { userId } = socket.data;
      if (!userId) return cb({ ok: false, error: "Not authenticated" });
      const target = authStore.findByNicknameAndDiscriminator(nickname, discriminator);
      if (!target) return cb({ ok: false, error: "User not found" });
      if (target.id === userId) return cb({ ok: false, error: "Cannot add yourself" });
      authStore.addFriendRequest(userId, target.id);
      // notify target if online
      io.to(target.id).emit("friend:request", {
        from: { userId, nickname: socket.data.nickname!, discriminator: socket.data.discriminator! },
      });
      cb({ ok: true });
    });

    socket.on("friend:accept", ({ userId: requesterId }, cb) => {
      const { userId } = socket.data;
      if (!userId) return cb({ ok: false, error: "Not authenticated" });
      authStore.acceptFriendRequest(requesterId, userId);
      io.to(requesterId).emit("friend:accepted", {
        by: { userId, nickname: socket.data.nickname!, discriminator: socket.data.discriminator! },
      });
      cb({ ok: true });
    });

    socket.on("friend:remove", ({ userId: otherId }, cb) => {
      const { userId } = socket.data;
      if (!userId) return cb({ ok: false, error: "Not authenticated" });
      authStore.removeFriend(userId, otherId);
      cb({ ok: true });
    });

    socket.on("friend:list", (_, cb) => {
      const { userId } = socket.data;
      if (!userId) return cb({ ok: true, friends: [] });
      const rows = authStore.getFriends(userId);
      const friends = rows.map((row) => ({
        userId: row.userId,
        nickname: row.nickname,
        discriminator: row.discriminator,
        status: row.status,
        incoming: row.incoming,
        online: io.sockets.adapter.rooms.has(row.userId),
      }));
      cb({ ok: true, friends });
    });

    socket.on("room:inviteFriend", ({ userId: targetId }, cb) => {
      const { userId, currentRoomCode } = socket.data;
      if (!userId || !currentRoomCode) return cb({ ok: false, error: "Not in a room" });
      io.to(targetId).emit("friend:invite", {
        from: { userId, nickname: socket.data.nickname!, discriminator: socket.data.discriminator! },
        roomCode: currentRoomCode,
      });
      cb({ ok: true });
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
