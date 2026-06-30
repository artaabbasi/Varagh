/**
 * Integration tests for Shelem running through the generic GameRunner — proving
 * the new game needs NO game-specific server code:
 *   - view redaction (a client never receives another seat's hand or the Zamin),
 *   - the disconnect → bot-takeover flow (Shelem ships getBotMove).
 *
 * Mirrors the fake-io pattern in game-runner.test.ts / pasur-runner.test.ts.
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

const SEATS = ["Ava", "Bijan", "Cyrus", "Darya"] as const;

function createShelemRoom(roomStore: RoomStore): Room {
  const room = roomStore.create({
    gameId: "shelem",
    variantId: "shelem-4p",
    options: {},
    isPublic: false,
    host: { playerId: "Ava", nickname: "Ava", discriminator: "0001", connected: true, ready: true },
  });
  for (const p of ["Bijan", "Cyrus", "Darya"]) {
    roomStore.join(room.code, { playerId: p, nickname: p, discriminator: "0000", connected: true, ready: true });
  }
  return roomStore.get(room.code)!;
}

type Shelemish = { currentTurn: string | null; players: string[]; phase: string };

describe("Shelem via GameRunner — view redaction", () => {
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

  it("no player's view exposes the hands map, another seat's hand, or the Zamin", () => {
    const room = createShelemRoom(roomStore);
    gameRunner.startGame(room);

    type Card = { rank: string; suit: string };
    const fullHands = (room.gameState as { hands: Record<string, Card[]> }).hands;

    for (const playerId of SEATS) {
      const view = latestView(emitted, playerId) as { hand: Card[]; zamin: Card[] };
      expect(view).not.toHaveProperty("hands");
      expect(view).not.toHaveProperty("zaminPile");
      expect(view).not.toHaveProperty("deck");
      // No hakem yet (bidding) → the Zamin is hidden from everyone by default.
      expect(view.zamin).toHaveLength(0);

      const otherCards = new Set<string>();
      for (const [otherId, hand] of Object.entries(fullHands)) {
        if (otherId !== playerId) for (const c of hand) otherCards.add(`${c.rank}|${c.suit}`);
      }
      for (const c of view.hand) expect(otherCards.has(`${c.rank}|${c.suit}`)).toBe(false);
      expect(view.hand).toEqual(fullHands[playerId]);
    }
  });
});

describe("GameRunner — generic bot takeover (Shelem)", () => {
  let roomStore: RoomStore;
  let gameRunner: GameRunner;

  beforeEach(() => {
    vi.useFakeTimers();
    const { io } = makeMockIo();
    roomStore = new RoomStore();
    gameRunner = new GameRunner(io as never, roomStore);
  });

  afterEach(() => { vi.useRealTimers(); });

  it("plays a disconnected human's bidding turn with the bot after grace, seat stays human", () => {
    const room = createShelemRoom(roomStore);
    gameRunner.startGame(room);

    const absent = (room.gameState as Shelemish).currentTurn!;
    gameRunner.handleDisconnect(room.code, absent);

    // Nothing before grace.
    vi.advanceTimersByTime(GRACE_MS - 1);
    expect((room.gameState as Shelemish).currentTurn).toBe(absent);

    // Past grace + a think delay the bot acts; the auction moves off this seat.
    vi.advanceTimersByTime(AUTO_THINK_MAX_MS + 2);
    const s1 = room.gameState as Shelemish;
    expect(s1.currentTurn).not.toBe(absent);
    expect(room.phase).toBe("playing");

    const seat = room.seats.find((p) => p.playerId === absent)!;
    expect(seat.isBot).toBeFalsy();
  });
});
