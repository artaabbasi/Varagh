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
    if (!room || room.phase !== "lobby") return null;
    if (room.seats.some((s) => s.playerId === seat.playerId)) return room;
    room.seats.push(seat);
    return room;
  }

  leave(code: string, playerId: string): Room | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    room.seats = room.seats.filter((s) => s.playerId !== playerId);
    if (room.seats.length === 0) {
      this.rooms.delete(code);
      return null;
    }
    if (room.hostPlayerId === playerId) {
      room.hostPlayerId = room.seats[0].playerId;
    }
    return room;
  }

  setConnected(code: string, playerId: string, connected: boolean): void {
    const seat = this.rooms.get(code)?.seats.find((s) => s.playerId === playerId);
    if (seat) seat.connected = connected;
  }

  listPublic(): Room[] {
    return [...this.rooms.values()].filter((r) => r.isPublic && r.phase === "lobby");
  }
}
