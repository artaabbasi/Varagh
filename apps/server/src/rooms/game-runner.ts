/**
 * GameRunner — the single place where the game registry meets live rooms.
 *
 * Responsibilities:
 *  - Look up the right GameDefinition from the shared registry.
 *  - Hold the seeded RNG and live game state (non-serializable parts).
 *  - Broadcast per-player views with visibility-filtered events.
 *  - Run per-turn timers (TURN_MS) and play getDefaultMove on expiry.
 *  - Run disconnect grace timers (GRACE_MS); after expiry, future turns
 *    for that player are auto-played immediately (0 ms delay).
 *
 * What it does NOT do: auth, join-code generation, lobby management.
 * Transport stays thin; this class only needs the io reference for emitting.
 */

import { randomInt } from "crypto";
import type { Server } from "socket.io";
import {
  games,
  makeRng,
  type ClientToServerEvents,
  type GameDefinition,
  type GameEvent,
  type Rng,
  type ServerToClientEvents,
  type SocketData,
} from "@varagh/shared";
import type { Room } from "./room";
import type { RoomStore } from "./room-store";

// ── Tunable constants ──────────────────────────────────────────────────────

/** Milliseconds before an idle turn is auto-played with getDefaultMove. */
export const TURN_MS = 30_000;

/** Milliseconds a disconnected player has to reconnect before their turns
 *  start being auto-played immediately. */
export const GRACE_MS = 10_000;

/**
 * Safety limit: if this many consecutive auto-moves fire without a real
 * player move, we abandon the game to prevent runaway loops.
 */
const MAX_AUTO_MOVES = 60;

// ── Types ──────────────────────────────────────────────────────────────────

type AppServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

interface RoomGame {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  engine: GameDefinition<any, any, any>;
  rng: Rng;
  turnTimer?: ReturnType<typeof setTimeout>;
  graceTimers: Map<string, ReturnType<typeof setTimeout>>;
  /** Players whose grace period has expired; their turns are auto-played at 0 ms. */
  disconnectedPastGrace: Set<string>;
  /** How many consecutive auto-moves have fired (circuit-breaker counter). */
  autoMoveCount: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isVisibleTo(event: GameEvent, playerId: string): boolean {
  switch (event.visibility.kind) {
    case "public":  return true;
    case "players": return event.visibility.ids.includes(playerId);
    case "private": return event.visibility.id === playerId;
  }
}

function getCurrentPlayer(room: Room): string | null {
  return (room.gameState as { currentTurn?: string | null } | null)?.currentTurn ?? null;
}

// ── GameRunner ─────────────────────────────────────────────────────────────

export class GameRunner {
  private readonly games = new Map<string, RoomGame>();

  constructor(
    private readonly io: AppServer,
    private readonly roomStore: RoomStore,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Validate the room, call engine.setup, transition to "playing", and
   * broadcast initial per-player views. Must be called by the host.
   */
  startGame(room: Room): { ok: true } | { ok: false; error: string } {
    if (room.phase !== "lobby")
      return { ok: false, error: "Room is not in lobby phase" };

    const engine = games.find((g) => g.id === room.gameId);
    if (!engine)
      return { ok: false, error: `Unknown game: ${room.gameId}` };

    const variant = engine.variants.find((v) => v.id === room.variantId);
    if (!variant)
      return { ok: false, error: `Unknown variant: ${room.variantId}` };

    const n = room.seats.length;
    if (n < variant.minPlayers || n > variant.maxPlayers)
      return {
        ok: false,
        error: `Need ${variant.minPlayers}–${variant.maxPlayers} players, got ${n}`,
      };

    // Merge room options with variant defaults.
    const options: Record<string, unknown> = {};
    for (const opt of variant.options ?? []) {
      options[opt.key] = room.options[opt.key] ?? opt.default;
    }

    const seed = randomInt(2 ** 31);
    const rng = makeRng(seed);
    const players = room.seats.map((s) => s.playerId);
    const state = engine.setup({ variantId: room.variantId, players, options, rng });

    room.phase = "playing";
    room.gameState = state;

    const game: RoomGame = {
      engine,
      rng,
      graceTimers: new Map(),
      disconnectedPastGrace: new Set(),
      autoMoveCount: 0,
    };
    this.games.set(room.code, game);

    this.broadcastViews(room, game, []);
    this.scheduleTurn(room, game);

    return { ok: true };
  }

  /**
   * Validate and apply a player's move. Resets the turn timer on success.
   * Returns a localised English error string on failure.
   */
  applyPlayerMove(
    room: Room,
    playerId: string,
    move: unknown,
  ): { ok: true } | { ok: false; error: string } {
    const game = this.games.get(room.code);
    if (!game) return { ok: false, error: "No active game for this room" };
    if (room.phase !== "playing") return { ok: false, error: "Game is not in progress" };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = game.engine.applyMove(room.gameState, playerId, move as any, game.rng);
    if (!result.ok) return { ok: false, error: result.error.message.en };

    this.clearTurnTimer(game);
    game.autoMoveCount = 0; // a real player moved — reset the circuit breaker

    room.gameState = result.state;
    this.broadcastViews(room, game, result.events);
    if (this.checkGameOver(room, game)) return { ok: true };
    this.scheduleTurn(room, game);

    return { ok: true };
  }

  /**
   * Called when a player's socket disconnects. Starts the grace timer.
   * After GRACE_MS, future turns for this player are auto-played immediately.
   */
  handleDisconnect(roomCode: string, playerId: string): void {
    const game = this.games.get(roomCode);
    if (!game) return;

    // Clear any existing grace timer (e.g. rapid reconnect-disconnect cycle).
    const existing = game.graceTimers.get(playerId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      game.graceTimers.delete(playerId);
      game.disconnectedPastGrace.add(playerId);
      // If it's currently this player's turn, reschedule at 0 ms delay.
      const room = this.roomStore.get(roomCode);
      if (room?.phase === "playing" && getCurrentPlayer(room) === playerId) {
        this.scheduleTurn(room, game);
      }
    }, GRACE_MS);

    game.graceTimers.set(playerId, timer);
  }

  /**
   * Called when a player's socket reconnects (after auth + room:join).
   * Cancels the grace timer and sends the player their current view.
   */
  handleReconnect(roomCode: string, playerId: string): void {
    const game = this.games.get(roomCode);
    if (!game) return;

    const graceTimer = game.graceTimers.get(playerId);
    if (graceTimer) {
      clearTimeout(graceTimer);
      game.graceTimers.delete(playerId);
    }
    game.disconnectedPastGrace.delete(playerId);

    const room = this.roomStore.get(roomCode);
    if (!room) return;

    // Send the player their current view with no events (they missed those).
    const view = game.engine.getPlayerView(room.gameState, playerId);
    this.io.to(playerId).emit("game:stateUpdate", { view, events: [] });
  }

  /** Returns the live game data for a room (for testing / inspection). */
  getGame(roomCode: string): RoomGame | undefined {
    return this.games.get(roomCode);
  }

  // ── Private helpers ────────────────────────────────────────────────────

  /**
   * Emit a personalised game:stateUpdate to every seat.
   * Each player receives only the events the engine marks as visible to them.
   */
  private broadcastViews(room: Room, game: RoomGame, events: GameEvent[]): void {
    for (const seat of room.seats) {
      const view = game.engine.getPlayerView(room.gameState, seat.playerId);
      const playerEvents = events.filter((e) => isVisibleTo(e, seat.playerId));
      this.io.to(seat.playerId).emit("game:stateUpdate", { view, events: playerEvents });
    }
  }

  /**
   * Check outcome; if the game is over, emit game:ended, transition the
   * room to "finished", and tear down all timers.
   * Returns true if the game ended.
   */
  private checkGameOver(room: Room, game: RoomGame): boolean {
    const outcome = game.engine.getOutcome(room.gameState);
    if (!outcome) return false;

    room.phase = "finished";
    this.io.to(room.code).emit("game:ended", { outcome });
    this.cleanup(room.code);
    return true;
  }

  /**
   * Schedule the next turn timer.
   * Delay = 0 if the current player is disconnected-past-grace; TURN_MS otherwise.
   */
  private scheduleTurn(room: Room, game: RoomGame): void {
    this.clearTurnTimer(game);

    const currentPlayer = getCurrentPlayer(room);
    if (!currentPlayer) return; // gameOver or between phases with no active turn

    const validMoves = game.engine.getValidMoves(room.gameState, currentPlayer);
    if (validMoves.length === 0) return; // nothing to auto-play

    const delay = game.disconnectedPastGrace.has(currentPlayer) ? 0 : TURN_MS;

    game.turnTimer = setTimeout(() => {
      game.turnTimer = undefined;
      const freshRoom = this.roomStore.get(room.code);
      if (!freshRoom || freshRoom.phase !== "playing") return;
      this.playDefaultMove(freshRoom, game, currentPlayer);
    }, delay);
  }

  /**
   * Apply getDefaultMove on behalf of the given player, then continue the
   * turn loop. A circuit-breaker prevents infinite auto-play (e.g. all
   * players simultaneously disconnected).
   */
  private playDefaultMove(room: Room, game: RoomGame, playerId: string): void {
    if (++game.autoMoveCount > MAX_AUTO_MOVES) {
      this.cleanup(room.code);
      return;
    }

    const validMoves = game.engine.getValidMoves(room.gameState, playerId);
    if (validMoves.length === 0) return;

    const defaultMove = game.engine.getDefaultMove(room.gameState, playerId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = game.engine.applyMove(room.gameState, playerId, defaultMove as any, game.rng);
    if (!result.ok) return;

    room.gameState = result.state;
    this.broadcastViews(room, game, result.events);
    if (this.checkGameOver(room, game)) return;
    this.scheduleTurn(room, game);
  }

  private clearTurnTimer(game: RoomGame): void {
    if (game.turnTimer) {
      clearTimeout(game.turnTimer);
      game.turnTimer = undefined;
    }
  }

  /** Cancel all timers for a room and remove its entry. */
  private cleanup(roomCode: string): void {
    const game = this.games.get(roomCode);
    if (!game) return;
    this.clearTurnTimer(game);
    for (const t of game.graceTimers.values()) clearTimeout(t);
    this.games.delete(roomCode);
  }
}
