/**
 * Integration tests for GameRunner.
 *
 * Uses a fake io that captures every emit so we can assert on what each
 * player actually received — without a real Socket.IO server.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameRunner, GRACE_MS, TURN_MS, AUTO_THINK_MAX_MS } from "./game-runner";
import { RoomStore } from "./room-store";
import type { Room } from "./room";

// ── Fake io ────────────────────────────────────────────────────────────────

type Emission = { event: string; data: unknown };

function makeMockIo(): { io: unknown; emitted: Map<string, Emission[]> } {
  const emitted = new Map<string, Emission[]>();
  const io = {
    to(id: string) {
      return {
        emit(event: string, data: unknown) {
          if (!emitted.has(id)) emitted.set(id, []);
          emitted.get(id)!.push({ event, data });
        },
      };
    },
  };
  return { io, emitted };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function stateUpdates(emitted: Map<string, Emission[]>, playerId: string): Emission[] {
  return (emitted.get(playerId) ?? []).filter((e) => e.event === "game:stateUpdate");
}

function latestView(
  emitted: Map<string, Emission[]>,
  playerId: string,
): Record<string, unknown> {
  const updates = stateUpdates(emitted, playerId);
  if (updates.length === 0) throw new Error(`No stateUpdate for ${playerId}`);
  return (updates[updates.length - 1].data as { view: Record<string, unknown> }).view;
}

// ── Fixtures ───────────────────────────────────────────────────────────────

const SEATS_4P = ["Alice", "Bob", "Carol", "Dave"] as const;

function create4pRoom(roomStore: RoomStore): Room {
  const room = roomStore.create({
    gameId: "hokm",
    variantId: "hokm-4p",
    options: {},
    isPublic: false,
    host: { playerId: "Alice", nickname: "Alice", discriminator: "0001", connected: true, ready: true },
  });
  for (const p of SEATS_4P.slice(1)) {
    roomStore.join(room.code, {
      playerId: p,
      nickname: p,
      discriminator: "0000",
      connected: true,
      ready: true,
    });
  }
  return roomStore.get(room.code)!;
}

/** Start a 4p game and have the hakem choose trump so everyone gets 13 cards. */
function startAndDeal(gameRunner: GameRunner, room: Room): string {
  const r = gameRunner.startGame(room);
  if (!r.ok) throw new Error("startGame failed: " + r.error);

  const s = room.gameState as { players: string[]; hakemIndex: number };
  const hakem = s.players[s.hakemIndex];

  const m = gameRunner.applyPlayerMove(room, hakem, { type: "chooseTrump", suit: "spades" });
  if (!m.ok) throw new Error("chooseTrump failed: " + m.error);

  return hakem;
}

// ── View-redaction tests ────────────────────────────────────────────────────

describe("GameRunner — view redaction", () => {
  let roomStore: RoomStore;
  let emitted: Map<string, Emission[]>;
  let gameRunner: GameRunner;

  beforeEach(() => {
    vi.useFakeTimers();
    const { io, emitted: e } = makeMockIo();
    emitted = e;
    roomStore = new RoomStore();
    gameRunner = new GameRunner(io as never, roomStore);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("no player's stateUpdate exposes another player's hand", () => {
    const room = create4pRoom(roomStore);
    startAndDeal(gameRunner, room);

    type Card = { rank: string; suit: string };
    const fullHands = (room.gameState as { hands: Record<string, Card[]> }).hands;

    for (const playerId of SEATS_4P) {
      const view = latestView(emitted, playerId) as { hand: Card[]; hands?: unknown };

      // The view must not expose the raw 'hands' map (all players' cards).
      expect(view).not.toHaveProperty("hands");

      // Collect all cards from OTHER players' full hands.
      const otherCards = new Set<string>();
      for (const [otherId, hand] of Object.entries(fullHands)) {
        if (otherId !== playerId) {
          for (const c of hand) otherCards.add(`${c.rank}|${c.suit}`);
        }
      }

      // None of those cards may appear in this player's view.hand.
      for (const c of view.hand) {
        expect(
          otherCards.has(`${c.rank}|${c.suit}`),
          `Player ${playerId}'s view contains ${c.rank}${c.suit} from another hand`,
        ).toBe(false);
      }
    }
  });

  it("each player's view.hand exactly matches their full-state hand", () => {
    const room = create4pRoom(roomStore);
    startAndDeal(gameRunner, room);

    const fullHands = (room.gameState as { hands: Record<string, unknown[]> }).hands;
    for (const playerId of SEATS_4P) {
      const view = latestView(emitted, playerId) as { hand: unknown[] };
      expect(view.hand).toEqual(fullHands[playerId]);
    }
  });

  it("view never includes deckForDeal", () => {
    const room = create4pRoom(roomStore);
    startAndDeal(gameRunner, room);
    for (const playerId of SEATS_4P) {
      expect(latestView(emitted, playerId)).not.toHaveProperty("deckForDeal");
    }
  });

  it("private stockCardSeen events reach only the addressed player (2p drawing phase)", () => {
    const room2p = roomStore.create({
      gameId: "hokm",
      variantId: "hokm-2p",
      options: {},
      isPublic: false,
      host: { playerId: "X", nickname: "X", discriminator: "0001", connected: true, ready: true },
    });
    roomStore.join(room2p.code, {
      playerId: "Y",
      nickname: "Y",
      discriminator: "0002",
      connected: true,
      ready: true,
    });
    const room = roomStore.get(room2p.code)!;

    const start = gameRunner.startGame(room);
    expect(start.ok).toBe(true);

    const s = room.gameState as { players: string[]; hakemIndex: number };
    const hakem = s.players[s.hakemIndex];
    const opponent = s.players.find((p) => p !== hakem)!;

    // chooseTrump triggers the drawing phase and emits a private stockCardSeen.
    gameRunner.applyPlayerMove(room, hakem, { type: "chooseTrump", suit: "hearts" });

    const hasSeenEvent = (pid: string): boolean =>
      (emitted.get(pid) ?? []).some(
        (e) =>
          e.event === "game:stateUpdate" &&
          ((e.data as { events: Array<{ type: string }> }).events ?? []).some(
            (ev) => ev.type === "stockCardSeen",
          ),
      );

    expect(hasSeenEvent(hakem)).toBe(true);
    expect(hasSeenEvent(opponent)).toBe(false);
  });
});

// ── Move-validation tests ───────────────────────────────────────────────────

describe("GameRunner — move validation", () => {
  let roomStore: RoomStore;
  let gameRunner: GameRunner;

  beforeEach(() => {
    vi.useFakeTimers();
    const { io } = makeMockIo();
    roomStore = new RoomStore();
    gameRunner = new GameRunner(io as never, roomStore);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects a move from the wrong player (NOT_YOUR_TURN)", () => {
    const room = create4pRoom(roomStore);
    gameRunner.startGame(room);

    const s = room.gameState as { players: string[]; hakemIndex: number };
    const nonHakem = s.players.find((_, i) => i !== s.hakemIndex)!;

    const result = gameRunner.applyPlayerMove(room, nonHakem, {
      type: "chooseTrump",
      suit: "spades",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a move to a room with no active game", () => {
    const room = create4pRoom(roomStore);
    // Don't start the game — gameState is null
    const result = gameRunner.applyPlayerMove(room, "Alice", {
      type: "chooseTrump",
      suit: "spades",
    });
    expect(result.ok).toBe(false);
  });

  it("startGame rejects a room with too few players", () => {
    const room = roomStore.create({
      gameId: "hokm",
      variantId: "hokm-4p",
      options: {},
      isPublic: false,
      host: { playerId: "Solo", nickname: "Solo", discriminator: "0001", connected: true, ready: true },
    });
    const result = gameRunner.startGame(roomStore.get(room.code)!);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/player/i);
  });

  it("startGame rejects an unknown game id", () => {
    const room = roomStore.create({
      gameId: "nonexistent",
      variantId: "nonexistent-4p",
      options: {},
      isPublic: false,
      host: { playerId: "P0", nickname: "P0", discriminator: "0001", connected: true, ready: true },
    });
    const result = gameRunner.startGame(roomStore.get(room.code)!);
    expect(result.ok).toBe(false);
  });
});

// ── Timer and reconnect tests ───────────────────────────────────────────────

describe("GameRunner — turn timer and disconnect grace", () => {
  let roomStore: RoomStore;
  let emitted: Map<string, Emission[]>;
  let gameRunner: GameRunner;

  beforeEach(() => {
    vi.useFakeTimers();
    const { io, emitted: e } = makeMockIo();
    emitted = e;
    roomStore = new RoomStore();
    gameRunner = new GameRunner(io as never, roomStore);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("auto-plays chooseTrump after TURN_MS elapses", () => {
    const room = create4pRoom(roomStore);
    gameRunner.startGame(room);
    expect((room.gameState as { phase: string }).phase).toBe("choosingTrump");

    vi.advanceTimersByTime(TURN_MS + 1);

    expect((room.gameState as { phase: string }).phase).toBe("playing");
  });

  it("real player move resets the turn timer", () => {
    const room = create4pRoom(roomStore);
    gameRunner.startGame(room);

    const s = room.gameState as { players: string[]; hakemIndex: number };
    const hakem = s.players[s.hakemIndex];

    // Advance to almost-expired.
    vi.advanceTimersByTime(TURN_MS - 500);
    expect((room.gameState as { phase: string }).phase).toBe("choosingTrump");

    // Real move cancels the old timer and starts a fresh TURN_MS.
    gameRunner.applyPlayerMove(room, hakem, { type: "chooseTrump", suit: "spades" });
    expect((room.gameState as { phase: string }).phase).toBe("playing");

    // Record trick count so we can detect if an auto-play fires.
    const countBefore = JSON.stringify(
      (room.gameState as { tricksTaken: unknown }).tricksTaken,
    );

    // Advance to just short of the new timer expiry — no auto-play yet.
    vi.advanceTimersByTime(TURN_MS - 1);
    expect(
      JSON.stringify((room.gameState as { tricksTaken: unknown }).tricksTaken),
    ).toBe(countBefore);
  });

  it("after disconnect grace expires, the player's turns are auto-played without waiting TURN_MS", () => {
    const room = create4pRoom(roomStore);
    gameRunner.startGame(room);

    const s = room.gameState as { players: string[]; hakemIndex: number };
    const hakem = s.players[s.hakemIndex];

    // If there were no grace behaviour the hakem's turn would only auto-play
    // after TURN_MS (30 s).  With grace + disconnect, it should happen shortly
    // after GRACE_MS plus a short human-like "thinking" pause — well before TURN_MS.
    gameRunner.handleDisconnect(room.code, hakem);

    // Advance a tick short of grace expiry: nothing should have happened yet.
    vi.advanceTimersByTime(GRACE_MS - 1);
    expect((room.gameState as { phase: string }).phase).toBe("choosingTrump");

    // Past grace the turn reschedules with a randomised think delay (≤ AUTO_THINK_MAX_MS).
    // Advancing past that — but still far below TURN_MS — fires the auto-play.
    vi.advanceTimersByTime(AUTO_THINK_MAX_MS + 2); // total ≈ GRACE_MS + think delay
    expect(AUTO_THINK_MAX_MS).toBeLessThan(TURN_MS);

    expect((room.gameState as { phase: string }).phase).toBe("playing");
  });

  it("handleReconnect within grace cancels the grace timer, no auto-play happens", () => {
    const room = create4pRoom(roomStore);
    gameRunner.startGame(room);

    const s = room.gameState as { players: string[]; hakemIndex: number };
    const hakem = s.players[s.hakemIndex];
    const before = stateUpdates(emitted, hakem).length;

    gameRunner.handleDisconnect(room.code, hakem);
    gameRunner.handleReconnect(room.code, hakem);

    // handleReconnect sends a fresh view.
    expect(stateUpdates(emitted, hakem).length).toBeGreaterThan(before);

    // After GRACE_MS, no auto-play because grace was cancelled.
    vi.advanceTimersByTime(GRACE_MS + 1);
    expect((room.gameState as { phase: string }).phase).toBe("choosingTrump");
  });

  it("each player receives a game:stateUpdate after startGame", () => {
    const room = create4pRoom(roomStore);
    gameRunner.startGame(room);

    for (const p of SEATS_4P) {
      expect(stateUpdates(emitted, p).length).toBeGreaterThan(0);
    }
  });

  it("closes the game when two players are disconnected past grace", () => {
    const room = create4pRoom(roomStore);
    gameRunner.startGame(room);
    expect(room.phase).toBe("playing");

    // One disconnect past grace: game continues (auto-play), not aborted.
    gameRunner.handleDisconnect(room.code, "Bob");
    vi.advanceTimersByTime(GRACE_MS + 1);
    expect(room.phase).toBe("playing");

    // A second disconnect past grace: the game is abandoned for everyone.
    gameRunner.handleDisconnect(room.code, "Carol");
    vi.advanceTimersByTime(GRACE_MS + 1);

    expect(room.phase).toBe("finished");
    expect(gameRunner.getGame(room.code)).toBeUndefined();
    const aborted = (emitted.get(room.code) ?? []).filter((e) => e.event === "game:aborted");
    expect(aborted.length).toBe(1);
  });
});

// ── Abort (player left mid-game) ─────────────────────────────────────────────

describe("GameRunner — abortGame", () => {
  let roomStore: RoomStore;
  let gameRunner: GameRunner;

  beforeEach(() => {
    vi.useFakeTimers();
    const { io } = makeMockIo();
    roomStore = new RoomStore();
    gameRunner = new GameRunner(io as never, roomStore);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ends an in-progress game and tears down its live state", () => {
    const room = create4pRoom(roomStore);
    gameRunner.startGame(room);
    expect(room.phase).toBe("playing");
    expect(gameRunner.getGame(room.code)).toBeDefined();

    gameRunner.abortGame(room);

    expect(room.phase).toBe("finished");
    expect(gameRunner.getGame(room.code)).toBeUndefined();
  });

  it("stops the turn timer so no auto-play fires after the game is aborted", () => {
    const room = create4pRoom(roomStore);
    gameRunner.startGame(room);
    const phaseBefore = (room.gameState as { phase: string }).phase;

    gameRunner.abortGame(room);

    // Well past TURN_MS: had the timer survived, it would have auto-played.
    vi.advanceTimersByTime(TURN_MS * 2);
    expect((room.gameState as { phase: string }).phase).toBe(phaseBefore);
    expect(room.phase).toBe("finished");
  });

  it("is a no-op on a room that is not playing", () => {
    const room = create4pRoom(roomStore);
    expect(room.phase).toBe("lobby");
    gameRunner.abortGame(room);
    expect(room.phase).toBe("lobby");
  });
});

// ── Bots ─────────────────────────────────────────────────────────────────────

function botSeat(id: string) {
  return { playerId: id, nickname: id, discriminator: "0000", connected: true, ready: true, isBot: true };
}

function create4pBotRoom(roomStore: RoomStore): Room {
  const room = roomStore.create({
    gameId: "hokm",
    variantId: "hokm-4p",
    options: {},
    isPublic: false,
    host: botSeat("bot:1"),
  });
  for (const id of ["bot:2", "bot:3", "bot:4"]) roomStore.join(room.code, botSeat(id));
  return roomStore.get(room.code)!;
}

describe("GameRunner — bots", () => {
  let roomStore: RoomStore;
  let gameRunner: GameRunner;

  beforeEach(() => {
    vi.useFakeTimers();
    const { io } = makeMockIo();
    roomStore = new RoomStore();
    gameRunner = new GameRunner(io as never, roomStore);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("auto-plays a bot's turn after a short think delay, no human input needed", () => {
    const room = create4pBotRoom(roomStore);
    gameRunner.startGame(room);
    expect((room.gameState as { phase: string }).phase).toBe("choosingTrump");

    // The hakem is a bot; within one think delay it picks trump on its own.
    vi.advanceTimersByTime(AUTO_THINK_MAX_MS + 1);
    expect((room.gameState as { phase: string }).phase).toBe("playing");
  });

  it("bot auto-plays do NOT trip the runaway-auto-play circuit breaker", () => {
    const room = create4pBotRoom(roomStore);
    gameRunner.startGame(room);

    // Let an all-bot table play out far more than MAX_AUTO_MOVES (60) turns.
    // The breaker kills a game by calling cleanup() WITHOUT finishing it — i.e.
    // the live game vanishes while room.phase is still "playing". With bots
    // excluded from the breaker, that must never happen: the game either is
    // still running or has legitimately finished.
    vi.advanceTimersByTime(AUTO_THINK_MAX_MS * 120);
    const breakerKilled = room.phase === "playing" && gameRunner.getGame(room.code) === undefined;
    expect(breakerKilled).toBe(false);
  });
});

describe("RoomStore — bots", () => {
  it("addBot fills seats up to capacity; removeBot removes only bots", () => {
    const roomStore = new RoomStore();
    const room = roomStore.create({
      gameId: "hokm",
      variantId: "hokm-4p",
      options: {},
      isPublic: false,
      host: { playerId: "Alice", nickname: "Alice", discriminator: "0001", connected: true, ready: true },
    });

    expect(roomStore.addBot(room.code, botSeat("b1"), 4)).toBeTruthy();
    expect(roomStore.addBot(room.code, botSeat("b2"), 4)).toBeTruthy();
    expect(roomStore.addBot(room.code, botSeat("b3"), 4)).toBeTruthy();
    // Room is now full (4 seats) — further bots are rejected.
    expect(roomStore.addBot(room.code, botSeat("b4"), 4)).toBeNull();

    // The human host is not a bot and cannot be removed via removeBot.
    expect(roomStore.removeBot(room.code, "Alice")).toBeNull();
    // A bot can be removed.
    expect(roomStore.removeBot(room.code, "b1")).toBeTruthy();
    expect(roomStore.get(room.code)!.seats.length).toBe(3);
  });
});
