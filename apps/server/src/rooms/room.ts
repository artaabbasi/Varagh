export type RoomPhase = "lobby" | "playing" | "finished";

export interface Seat {
  playerId: string;
  nickname: string;
  discriminator: string;
  connected: boolean;
  /** Pre-game lobby ready state. The host is always treated as ready. */
  ready: boolean;
  /** Small compressed data-URL avatar, or null/undefined. */
  avatar?: string | null;
}

export interface Room {
  code: string;
  gameId: string;
  variantId: string;
  options: Record<string, unknown>;
  isPublic: boolean;
  hostPlayerId: string;
  seats: Seat[];
  phase: RoomPhase;
  gameState: unknown;
  createdAt: number;
}
