/**
 * Integration tests for Pasur running through the generic GameRunner — proving
 * the new game needs no game-specific server code:
 *   - view redaction (a client never receives the opponent's hand or the deck),
 *   - the disconnect → bot-takeover → reconnect flow (Pasur ships getBotMove),
 *   - the getDefaultMove fallback for a game with no bot (Hokm).
 *
 * Mirrors the fake-io pattern in game-runner.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameRunner, GRACE_MS, AUTO_THINK_MAX_MS } from "./game-runner";
import { RoomStore } from "./room-store";
import type { Room } from "./room";

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

function latestView(emitted: Map<string, Emission[]>, playerId: string): Record<string, unknown> {
  const updates = (emitted.get(playerId) ?? []).filter((e) => e.event === "game:stateUpdate");
  if (updates.length === 0) throw new Error(`No stateUpdate for ${playerId}`);
  return (updates[updates.length - 1].data as { view: Record<string, unknown> }).view;
}

const PASUR_SEATS = ["Ava", "Bijan"] as const;

function createPasurRoom(roomStore: RoomStore): Room {
  const room = roomStore.create({
    gameId: "pasur",
    variantId: "pasur-2p",
    options: {},
    isPublic: false,
    host: { playerId: "Ava", nickname: "Ava", discriminator: "0001", connected: true, ready: true },
  });
  roomStore.join(room.code, { playerId: "Bijan", nickname: "Bijan", discriminator: "0002", connected: true, ready: true });
  return roomStore.get(room.code)!;
}

type Pasurish = {
  currentTurn: string | null;
  players: string[];
  hands: Record<string, unknown[]>;
};

// ── View redaction ───────────────────────────────────────────────────────────

describe("Pasur via GameRunner — view redaction", () => {
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

  afterEach(() => { vi.useRealTimers(); });

  it("no player's view exposes the other's hand, the full hands map, or the deck", () => {
    const room = createPasurRoom(roomStore);
    gameRunner.startGame(room);

    type Card = { rank: string; suit: string };
    const fullHands = (room.gameState as { hands: Record<string, Card[]> }).hands;

    for (const playerId of PASUR_SEATS) {
      const view = latestView(emitted, playerId) as { hand: Card[] };
      expect(view).not.toHaveProperty("hands");
      expect(view).not.toHaveProperty("deck");
      expect(view).not.toHaveProperty("captured");

      const otherCards = new Set<string>();
      for (const [otherId, hand] of Object.entries(fullHands)) {
        if (otherId !== playerId) for (const c of hand) otherCards.add(`${c.rank}|${c.suit}`);
      }
      for (const c of view.hand) {
        expect(otherCards.has(`${c.rank}|${c.suit}`)).toBe(false);
      }
      // The view shows the player exactly their own hand.
      expect(view.hand).toEqual(fullHands[playerId]);
    }
  });
});

// ── Generic bot-takeover hook ────────────────────────────────────────────────

describe("GameRunner — generic bot takeover (Pasur)", () => {
  let roomStore: RoomStore;
  let gameRunner: GameRunner;

  beforeEach(() => {
    vi.useFakeTimers();
    const { io } = makeMockIo();
    roomStore = new RoomStore();
    gameRunner = new GameRunner(io as never, roomStore);
  });

  afterEach(() => { vi.useRealTimers(); });

  it("plays a disconnected human's seat with the bot after grace, leaving the seat human", () => {
    const room = createPasurRoom(roomStore);
    gameRunner.startGame(room);

    const s0 = room.gameState as Pasurish;
    const absent = s0.currentTurn!;
    const other = s0.players.find((p) => p !== absent)!;
    const handBefore = s0.hands[absent].length;

    gameRunner.handleDisconnect(room.code, absent);

    // Nothing before grace expires.
    vi.advanceTimersByTime(GRACE_MS - 1);
    expect((room.gameState as Pasurish).currentTurn).toBe(absent);

    // Past grace + a think delay (still well under TURN_MS) the bot moves for them.
    vi.advanceTimersByTime(AUTO_THINK_MAX_MS + 2);
    const s1 = room.gameState as Pasurish;
    expect(s1.currentTurn).toBe(other); // turn advanced
    expect(s1.hands[absent].length).toBe(handBefore - 1); // a card was played for them
    expect(room.phase).toBe("playing"); // not aborted

    // The seat still belongs to the human, not replaced by a bot — the bot only
    // plays on their behalf through the takeover hook.
    const seat = room.seats.find((p) => p.playerId === absent)!;
    expect(seat.isBot).toBeFalsy();
  });

  it("reverts to the human the instant they reconnect within the window", () => {
    const room = createPasurRoom(roomStore);
    gameRunner.startGame(room);

    const absent = (room.gameState as Pasurish).currentTurn!;
    const handBefore = (room.gameState as Pasurish).hands[absent].length;

    gameRunner.handleDisconnect(room.code, absent);
    vi.advanceTimersByTime(GRACE_MS - 1); // still within grace
    gameRunner.handleReconnect(room.code, absent);

    // They are back and it is still their turn — they get a full turn timer, so a
    // mere think-delay's worth of time must NOT trigger an auto-play.
    vi.advanceTimersByTime(AUTO_THINK_MAX_MS + 2);
    const s = room.gameState as Pasurish;
    expect(s.currentTurn).toBe(absent);
    expect(s.hands[absent].length).toBe(handBefore);
  });
});

// ── getDefaultMove fallback (a game with no bot brain) ────────────────────────

describe("GameRunner — getDefaultMove fallback (Hokm has no getBotMove)", () => {
  let roomStore: RoomStore;
  let gameRunner: GameRunner;

  beforeEach(() => {
    vi.useFakeTimers();
    const { io } = makeMockIo();
    roomStore = new RoomStore();
    gameRunner = new GameRunner(io as never, roomStore);
  });

  afterEach(() => { vi.useRealTimers(); });

  it("auto-plays a disconnected Hokm seat via getDefaultMove (no bot defined)", () => {
    const room = roomStore.create({
      gameId: "hokm",
      variantId: "hokm-4p",
      options: {},
      isPublic: false,
      host: { playerId: "A", nickname: "A", discriminator: "0001", connected: true, ready: true },
    });
    for (const p of ["B", "C", "D"]) {
      roomStore.join(room.code, { playerId: p, nickname: p, discriminator: "0000", connected: true, ready: true });
    }
    const full = roomStore.get(room.code)!;
    gameRunner.startGame(full);

    const hakem = (full.gameState as { players: string[]; hakemIndex: number });
    const absent = hakem.players[hakem.hakemIndex];
    expect((full.gameState as { phase: string }).phase).toBe("choosingTrump");

    gameRunner.handleDisconnect(full.code, absent);
    vi.advanceTimersByTime(GRACE_MS + AUTO_THINK_MAX_MS + 2);

    // getDefaultMove picked a trump for the absent hakem → game advanced to play.
    expect((full.gameState as { phase: string }).phase).toBe("playing");
  });
});
