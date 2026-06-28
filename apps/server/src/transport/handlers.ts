import type { Server, Socket } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  RoomView,
} from "@varagh/shared";
import { games } from "@varagh/shared";
import { randomUUID } from "crypto";
import type { AuthStore } from "../auth/store";
import type { Room, Seat } from "../rooms/room";
import { isStickerId, STICKER_COOLDOWN_MS } from "@varagh/shared";
import { signup, login, loginWithPassword, hashPassword } from "../auth/auth";
import { RoomStore } from "../rooms/room-store";
import { toLobbyEntry } from "../rooms/lobby";
import { GameRunner } from "../rooms/game-runner";

/** Display names for bots. Picked so as not to collide within a room. */
const BOT_NAMES = ["آرش", "سارا", "کاوه", "نیلوفر", "بهرام", "رویا", "پویا", "مهتاب"];

/** Build a fresh bot seat, choosing a name not already used in the room. */
function makeBotSeat(room: Room): Seat {
  const taken = new Set(room.seats.map((s) => s.nickname));
  const name = BOT_NAMES.find((n) => !taken.has(n)) ?? `Bot ${room.seats.length}`;
  return {
    playerId: `bot:${randomUUID()}`,
    nickname: name,
    discriminator: String(1000 + Math.floor(Math.random() * 9000)),
    connected: true,
    ready: true,
    avatar: null,
    isBot: true,
  };
}

/** Maximum seats the room's variant allows, or 0 if unknown. */
function variantCapacity(room: Room): number {
  const engine = games.find((g) => g.id === room.gameId);
  const variant = engine?.variants.find((v) => v.id === room.variantId);
  return variant?.maxPlayers ?? 0;
}

// 2–20 chars: Persian letters, Latin letters, digits, spaces
const NICKNAME_RE = /^[؀-ۿa-zA-Z0-9 ]{2,20}$/;
// Username: 3–20 chars, must start with a letter, then letters/digits/underscore.
const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;
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
      // The host presses Start, so they always count as ready.
      ready: s.playerId === room.hostPlayerId ? true : s.ready,
      avatar: s.avatar ?? null,
      isBot: s.isBot ?? false,
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
    socket.data = { userId: null, nickname: null, discriminator: null, avatar: null, currentRoomCode: null };
    // Last sticker timestamp for this connection — drives the send cooldown.
    let lastStickerAt = 0;

    // ── Auth ──────────────────────────────────────────────────────────────

    socket.on("auth:signup", ({ username, displayName, password }, cb) => {
      const uname = username.trim().toLowerCase();
      const display = displayName.trim();
      if (!USERNAME_RE.test(uname)) {
        return cb({ ok: false, error: "invalid_username" });
      }
      if (!NICKNAME_RE.test(display)) {
        return cb({ ok: false, error: "invalid_nickname" });
      }
      if (password.length < PASSWORD_MIN) {
        return cb({ ok: false, error: "short_password" });
      }
      if (authStore.findByUsername(uname)) {
        return cb({ ok: false, error: "username_taken" });
      }
      try {
        const { token, user } = signup(authStore, uname, display, password);
        socket.data.userId = user.id;
        socket.data.nickname = user.nickname;
        socket.data.discriminator = user.discriminator;
        socket.data.avatar = user.avatar;
        void socket.join(user.id);
        cb({ ok: true, token, user });
      } catch {
        // Most likely the unique-username constraint lost a race.
        cb({ ok: false, error: "username_taken" });
      }
    });

    socket.on("auth:login", ({ token }, cb) => {
      const user = login(authStore, token);
      if (!user) return cb({ ok: false, error: "Invalid token" });
      socket.data.userId = user.id;
      socket.data.nickname = user.nickname;
      socket.data.discriminator = user.discriminator;
      socket.data.avatar = user.avatar;
      void socket.join(user.id);
      cb({ ok: true, user });
    });

    socket.on("auth:loginWithPassword", ({ username, password }, cb) => {
      const result = loginWithPassword(authStore, username.trim().toLowerCase(), password);
      if (!result) return cb({ ok: false, error: "invalid_credentials" });
      const { token, user } = result;
      socket.data.userId = user.id;
      socket.data.nickname = user.nickname;
      socket.data.discriminator = user.discriminator;
      socket.data.avatar = user.avatar;
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
          ready: true,
          avatar: socket.data.avatar,
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
        ready: false,
        avatar: socket.data.avatar,
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

    socket.on("room:setReady", ({ ready }, cb) => {
      const { userId, currentRoomCode } = socket.data;
      if (!userId || !currentRoomCode) return cb({ ok: false, error: "Not in a room" });
      const room = roomStore.setReady(currentRoomCode, userId, ready);
      if (!room) return cb({ ok: false, error: "Room not found" });
      io.to(room.code).emit("room:updated", toRoomView(room));
      cb({ ok: true });
    });

    socket.on("room:addBot", (_, cb) => {
      const { userId, currentRoomCode } = socket.data;
      if (!userId || !currentRoomCode) return cb({ ok: false, error: "Not in a room" });
      const room = roomStore.get(currentRoomCode);
      if (!room) return cb({ ok: false, error: "Room not found" });
      if (room.hostPlayerId !== userId) return cb({ ok: false, error: "Only the host can add bots" });
      if (room.phase !== "lobby") return cb({ ok: false, error: "Game already started" });

      const capacity = variantCapacity(room);
      const updated = roomStore.addBot(currentRoomCode, makeBotSeat(room), capacity);
      if (!updated) return cb({ ok: false, error: "Room is full" });
      io.to(room.code).emit("room:updated", toRoomView(updated));
      cb({ ok: true, room: toRoomView(updated) });
    });

    socket.on("room:removeBot", ({ playerId }, cb) => {
      const { userId, currentRoomCode } = socket.data;
      if (!userId || !currentRoomCode) return cb({ ok: false, error: "Not in a room" });
      const room = roomStore.get(currentRoomCode);
      if (!room) return cb({ ok: false, error: "Room not found" });
      if (room.hostPlayerId !== userId) return cb({ ok: false, error: "Only the host can remove bots" });

      const updated = roomStore.removeBot(currentRoomCode, playerId);
      if (!updated) return cb({ ok: false, error: "Could not remove bot" });
      io.to(room.code).emit("room:updated", toRoomView(updated));
      cb({ ok: true, room: toRoomView(updated) });
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

    socket.on("user:updateDisplayName", ({ displayName }, cb) => {
      const { userId } = socket.data;
      if (!userId) return cb({ ok: false, error: "Not authenticated" });
      const display = displayName.trim();
      if (!NICKNAME_RE.test(display)) return cb({ ok: false, error: "invalid_nickname" });
      const user = authStore.updateDisplayName(userId, display);
      if (!user) return cb({ ok: false, error: "User not found" });
      socket.data.nickname = user.nickname;
      cb({ ok: true, user });
    });

    socket.on("user:changePassword", ({ currentPassword, newPassword }, cb) => {
      const { userId } = socket.data;
      if (!userId) return cb({ ok: false, error: "Not authenticated" });
      if (newPassword.length < PASSWORD_MIN) return cb({ ok: false, error: "short_password" });
      if (!authStore.verifyPassword(userId, hashPassword(currentPassword))) {
        return cb({ ok: false, error: "wrong_password" });
      }
      authStore.updatePasswordHash(userId, hashPassword(newPassword));
      cb({ ok: true });
    });

    socket.on("user:updateAvatar", ({ avatar }, cb) => {
      const { userId } = socket.data;
      if (!userId) return cb({ ok: false, error: "Not authenticated" });
      // Cap size: a compressed ~160px JPEG data URL is well under this.
      if (avatar !== null) {
        if (!avatar.startsWith("data:image/")) return cb({ ok: false, error: "invalid_image" });
        if (avatar.length > 200_000) return cb({ ok: false, error: "image_too_large" });
      }
      const user = authStore.updateAvatar(userId, avatar);
      if (!user) return cb({ ok: false, error: "User not found" });
      socket.data.avatar = user.avatar;
      cb({ ok: true, user });
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

    socket.on("friend:recentlyPlayed", (_, cb) => {
      const { userId } = socket.data;
      if (!userId) return cb({ ok: true, players: [] });
      const rows = authStore.getRecentlyPlayed(userId);
      const players = rows.map((r) => ({
        userId: r.userId,
        nickname: r.nickname,
        discriminator: r.discriminator,
        lastPlayedAt: r.lastPlayedAt,
        online: io.sockets.adapter.rooms.has(r.userId),
      }));
      cb({ ok: true, players });
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

    socket.on("room:sticker", ({ stickerId }, cb) => {
      const { userId, currentRoomCode } = socket.data;
      if (!userId || !currentRoomCode) return cb({ ok: false, error: "Not in a room" });
      if (!isStickerId(stickerId)) return cb({ ok: false, error: "Unknown sticker" });
      const now = Date.now();
      if (now - lastStickerAt < STICKER_COOLDOWN_MS) {
        return cb({ ok: false, error: "Slow down" });
      }
      lastStickerAt = now;
      // Relay to everyone in the room (including the sender, so their own
      // sticker animates over their seat too).
      io.to(currentRoomCode).emit("room:sticker", { from: userId, stickerId });
      cb({ ok: true });
    });

    // ── Game ──────────────────────────────────────────────────────────────

    socket.on("game:start", (_, cb) => {
      const { userId, currentRoomCode } = socket.data;
      if (!userId || !currentRoomCode) return cb({ ok: false, error: "Not authenticated" });
      const room = roomStore.get(currentRoomCode);
      if (!room) return cb({ ok: false, error: "Room not found" });
      if (room.hostPlayerId !== userId) return cb({ ok: false, error: "Only the host can start" });

      // Everyone except the host must have readied up.
      const allReady = room.seats.every(
        (s) => s.playerId === room.hostPlayerId || s.ready,
      );
      if (!allReady) return cb({ ok: false, error: "All players must be ready" });

      const result = gameRunner.startGame(room);
      if (!result.ok) return cb({ ok: false, error: result.error });

      io.to(room.code).emit("room:updated", toRoomView(room));
      cb({ ok: true });
    });

    socket.on("room:endGame", (_, cb) => {
      const { userId, currentRoomCode, nickname } = socket.data;
      if (!userId || !currentRoomCode) return cb({ ok: false, error: "Not authenticated" });
      const room = roomStore.get(currentRoomCode);
      if (!room) return cb({ ok: false, error: "Room not found" });
      if (room.hostPlayerId !== userId) return cb({ ok: false, error: "Only the host can end the game" });

      if (room.phase === "playing") {
        gameRunner.abortGame(room);
        io.to(room.code).emit("game:aborted", { reason: "hostEnded", by: nickname });
      }
      cb({ ok: true });
    });

    socket.on("room:rematch", (_, cb) => {
      const { userId, currentRoomCode } = socket.data;
      if (!userId || !currentRoomCode) return cb({ ok: false, error: "Not in a room" });
      const room = roomStore.get(currentRoomCode);
      if (!room) return cb({ ok: false, error: "Room not found" });
      if (room.phase === "playing") return cb({ ok: false, error: "Game still in progress" });

      const updated = roomStore.rematch(currentRoomCode, userId);
      if (!updated) return cb({ ok: false, error: "Room not found" });

      // Everyone still in the room gets bounced back to the waiting room.
      io.to(updated.code).emit("room:updated", toRoomView(updated));
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
