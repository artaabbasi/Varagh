import type { Room, Seat } from "./room";
import { generateJoinCode } from "./join-code";

export interface CreateRoomParams {
  gameId: string;
  variantId: string;
  options: Record<string, unknown>;
  isPublic: boolean;
  host: Seat;
}

export class RoomStore {
  private readonly rooms = new Map<string, Room>();

  create(params: CreateRoomParams): Room {
    let code: string;
    do { code = generateJoinCode(); } while (this.rooms.has(code));

    const room: Room = {
      code,
      gameId: params.gameId,
      variantId: params.variantId,
      options: params.options,
      isPublic: params.isPublic,
      hostPlayerId: params.host.playerId,
      seats: [params.host],
      phase: "lobby",
      gameState: null,
      createdAt: Date.now(),
    };

    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  join(code: string, seat: Seat): Room | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    const existing = room.seats.find((s) => s.playerId === seat.playerId);
    if (existing) {
      // Allow reconnect to an existing seat regardless of room phase.
      existing.connected = seat.connected;
      return room;
    }
    // New seat — only allowed while the room is still in the lobby.
    if (room.phase !== "lobby") return null;
    room.seats.push(seat);
    return room;
  }

  leave(code: string, playerId: string): Room | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    room.seats = room.seats.filter((s) => s.playerId !== playerId);

    // A room with no humans left (only bots, or empty) is discarded — bots
    // fill seats for real players, they never keep a room alive on their own.
    const humans = room.seats.filter((s) => !s.isBot);
    if (humans.length === 0) {
      this.rooms.delete(code);
      return null;
    }
    // Host must always be a real player; never hand the room to a bot.
    if (room.hostPlayerId === playerId) {
      room.hostPlayerId = humans[0].playerId;
    }
    return room;
  }

  /** Add a bot seat. Only allowed in the lobby and up to `capacity` seats. */
  addBot(code: string, bot: Seat, capacity: number): Room | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    if (room.phase !== "lobby") return null;
    if (room.seats.length >= capacity) return null;
    room.seats.push({ ...bot, isBot: true });
    return room;
  }

  /** Remove a bot seat by id. Only bots may be removed, and only in the lobby. */
  removeBot(code: string, botId: string): Room | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    if (room.phase !== "lobby") return null;
    const seat = room.seats.find((s) => s.playerId === botId);
    if (!seat || !seat.isBot) return null;
    room.seats = room.seats.filter((s) => s.playerId !== botId);
    return room;
  }

  setConnected(code: string, playerId: string, connected: boolean): void {
    const seat = this.rooms.get(code)?.seats.find((s) => s.playerId === playerId);
    if (seat) seat.connected = connected;
  }

  setReady(code: string, playerId: string, ready: boolean): Room | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    const seat = room.seats.find((s) => s.playerId === playerId);
    if (seat) seat.ready = ready;
    return room;
  }

  listPublic(): Room[] {
    return [...this.rooms.values()].filter((r) => r.isPublic && r.phase === "lobby");
  }

  getActiveRoomsForUser(userId: string): Room[] {
    return [...this.rooms.values()].filter(
      (r) => r.phase !== "finished" && r.seats.some((s) => s.playerId === userId),
    );
  }

  getStats(): { activeGames: number; publicRooms: number } {
    const all = [...this.rooms.values()];
    return {
      activeGames: all.filter((r) => r.phase === "playing").length,
      publicRooms: all.filter((r) => r.phase === "lobby" && r.isPublic).length,
    };
  }
}
