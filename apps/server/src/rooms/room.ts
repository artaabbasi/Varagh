export type RoomPhase = "lobby" | "playing" | "finished";

export interface Seat {
  playerId: string;
  nickname: string;
  discriminator: string;
  connected: boolean;
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
