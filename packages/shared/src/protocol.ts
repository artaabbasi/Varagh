/**
 * Socket.IO event protocol shared between server and web.
 * Import from "@varagh/shared" on both sides — never from the server package.
 */

export interface UserRecord {
  id: string;
  nickname: string;
  discriminator: string;
}

export interface SeatView {
  playerId: string;
  nickname: string;
  discriminator: string;
  connected: boolean;
  isHost: boolean;
}

export interface RoomView {
  code: string;
  gameId: string;
  variantId: string;
  options: Record<string, unknown>;
  isPublic: boolean;
  phase: "lobby" | "playing" | "finished";
  seats: SeatView[];
}

export interface LobbyEntry {
  code: string;
  gameId: string;
  variantId: string;
  playerCount: number;
  hostNickname: string;
}

export interface ClientToServerEvents {
  "auth:signup": (
    data: { nickname: string },
    cb: (res: { ok: true; token: string; user: UserRecord } | { ok: false; error: string }) => void
  ) => void;
  "auth:login": (
    data: { token: string },
    cb: (res: { ok: true; user: UserRecord } | { ok: false; error: string }) => void
  ) => void;
  "room:create": (
    data: { gameId: string; variantId: string; options: Record<string, unknown>; isPublic: boolean },
    cb: (res: { ok: true; joinCode: string; room: RoomView } | { ok: false; error: string }) => void
  ) => void;
  "room:join": (
    data: { joinCode: string },
    cb: (res: { ok: true; room: RoomView } | { ok: false; error: string }) => void
  ) => void;
  "room:leave": (
    data: Record<string, never>,
    cb: (res: { ok: true } | { ok: false; error: string }) => void
  ) => void;
  "room:list": (
    data: Record<string, never>,
    cb: (res: { ok: true; rooms: LobbyEntry[] }) => void
  ) => void;
}

export interface ServerToClientEvents {
  "room:updated": (room: RoomView) => void;
  error: (data: { code: string; message: string }) => void;
}

export interface SocketData {
  userId: string | null;
  nickname: string | null;
  discriminator: string | null;
  currentRoomCode: string | null;
}
