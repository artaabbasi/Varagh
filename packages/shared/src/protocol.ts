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

export interface MatchHistoryEntry {
  matchId: string;
  gameId: string;
  variantId: string;
  endedAt: number;
  isWinner: boolean;
  score: string;
  opponents: string[];
}

export interface LobbyStats {
  onlineCount: number;
  activeGames: number;
  publicRooms: number;
  totalUsers: number;
}

export interface ActiveRoomEntry {
  code: string;
  gameId: string;
  variantId: string;
  phase: "lobby" | "playing" | "finished";
  playerCount: number;
}

export interface FriendEntry {
  userId: string;
  nickname: string;
  discriminator: string;
  online: boolean;
  /** "pending" = request sent/received but not yet accepted; "accepted" = mutual friends */
  status: "pending" | "accepted";
  /** true when this entry is an incoming request (you are the target, not the requester) */
  incoming: boolean;
}

export interface ClientToServerEvents {
  "auth:signup": (
    data: { nickname: string; password?: string },
    cb: (res: { ok: true; token: string; user: UserRecord } | { ok: false; error: string }) => void
  ) => void;
  "auth:login": (
    data: { token: string },
    cb: (res: { ok: true; user: UserRecord } | { ok: false; error: string }) => void
  ) => void;
  "auth:loginWithPassword": (
    data: { nickname: string; password: string },
    cb: (res: { ok: true; token: string; user: UserRecord } | { ok: false; error: string }) => void
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
  "lobby:getStats": (
    data: Record<string, never>,
    cb: (res: { ok: true; stats: LobbyStats }) => void
  ) => void;
  "user:getHistory": (
    data: Record<string, never>,
    cb: (res: { ok: true; matches: MatchHistoryEntry[] } | { ok: false; error: string }) => void
  ) => void;
  "user:getActiveRooms": (
    data: Record<string, never>,
    cb: (res: { ok: true; rooms: ActiveRoomEntry[] }) => void
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
  /** Send a friend request by nickname + discriminator. */
  "friend:add": (
    data: { nickname: string; discriminator: string },
    cb: (res: { ok: true } | { ok: false; error: string }) => void
  ) => void;
  /** Accept an incoming friend request from userId. */
  "friend:accept": (
    data: { userId: string },
    cb: (res: { ok: true } | { ok: false; error: string }) => void
  ) => void;
  /** Remove a friend or cancel a sent request. */
  "friend:remove": (
    data: { userId: string },
    cb: (res: { ok: true } | { ok: false; error: string }) => void
  ) => void;
  /** List all friends and pending requests. */
  "friend:list": (
    data: Record<string, never>,
    cb: (res: { ok: true; friends: FriendEntry[] }) => void
  ) => void;
  /** Invite a friend to the current room. */
  "room:inviteFriend": (
    data: { userId: string },
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
  /**
   * Emitted to the remaining players when an in-progress game is ended early
   * because a player left. The game is over; clients should return to lobby.
   */
  "game:aborted": (data: { reason: "playerLeft"; by: string | null }) => void;
  /** Someone sent you a friend request. */
  "friend:request": (data: { from: { userId: string; nickname: string; discriminator: string } }) => void;
  /** A friend request you sent was accepted. */
  "friend:accepted": (data: { by: { userId: string; nickname: string; discriminator: string } }) => void;
  /** A friend invited you to their room. */
  "friend:invite": (data: { from: { userId: string; nickname: string; discriminator: string }; roomCode: string }) => void;
}

export interface SocketData {
  userId: string | null;
  nickname: string | null;
  discriminator: string | null;
  currentRoomCode: string | null;
}
