/**
 * Socket.IO event protocol shared between server and web.
 * Import from "@varagh/shared" on both sides — never from the server package.
 */

import type { GameEvent, GameOutcome, PlayerViewBase } from "./engine/game-engine";

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
  /** Host starts the game (lobby → playing transition). */
  "game:start": (
    data: Record<string, never>,
    cb: (res: { ok: true } | { ok: false; error: string }) => void
  ) => void;
  /** Player submits a move. The move shape is game-specific. */
  "game:move": (
    data: { move: unknown },
    cb: (res: { ok: true } | { ok: false; error: string }) => void
  ) => void;
}

export interface ServerToClientEvents {
  "room:updated": (room: RoomView) => void;
  error: (data: { code: string; message: string }) => void;
  /**
   * Per-player state snapshot. Each player receives only their own view
   * plus the subset of events visible to them (public, addressed to them,
   * or private-to-them). Never contains another player's hand.
   */
  "game:stateUpdate": (data: { view: PlayerViewBase; events: GameEvent[] }) => void;
  /** Emitted once when the game is over. */
  "game:ended": (data: { outcome: GameOutcome }) => void;
}

export interface SocketData {
  userId: string | null;
  nickname: string | null;
  discriminator: string | null;
  currentRoomCode: string | null;
}
