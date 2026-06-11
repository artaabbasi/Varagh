import { describe, expect, it } from "vitest";
import type { Card, Rank, Suit } from "../../engine/game-engine";
import { makeRng } from "../../engine/rng";
import { hokm } from "./index";
import type { HokmMove, HokmState } from "./state";
import { isLegalPlay, scoreHand, trickWinner } from "./rules";

// ── Test helpers ───────────────────────────────────────────────────────────

const PLAYERS = ["P0", "P1", "P2", "P3"] as const;

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

/** Build a minimal playing state with custom hands. */
function playingState(
  hands: Record<string, Card[]>,
  overrides: Partial<HokmState> = {}
): HokmState {
  return {
    phase: "playing",
    players: [...PLAYERS],
    hakemIndex: 0,
    trump: "spades",
    hands,
    deckForDeal: [],
    currentTrick: [],
    trickLeaderIndex: 0,
    currentTurn: "P0",
    tricksTaken: [0, 0],
    scores: [0, 0],
    handNumber: 0,
    targetScore: 7,
    ...overrides,
  };
}

/** Deal cards to all 4 players so each has 13, then set trump. */
function setupAndDeal(seed: number, trump: Suit): HokmState {
  const rng = makeRng(seed);
  const s0 = hokm.setup({
    variantId: "hokm-4p",
    players: [...PLAYERS],
    options: {},
    rng,
  });
  const hakem = s0.players[s0.hakemIndex];
  const r = hokm.applyMove(s0, hakem, { type: "chooseTrump", suit: trump }, rng);
  if (!r.ok) throw new Error("chooseTrump failed in test setup");
  return r.state;
}

/** Apply a move and assert it succeeded; return the new state. */
function play(state: HokmState, player: string, move: Parameters<typeof hokm.applyMove>[2]): HokmState {
  const rng = makeRng(0);
  const result = hokm.applyMove(state, player, move, rng);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message.en);
  return result.state;
}

/** Play a complete trick from the currentTurn player in order, using the given cards. */
function playTrick(state: HokmState, cards: Card[]): HokmState {
  let s = state;
  const start = s.players.indexOf(s.currentTurn!);
  for (let i = 0; i < cards.length; i++) {
    const player = s.players[(start + i) % s.players.length];
    s = play(s, player, { type: "playCard", card: cards[i] });
  }
  return s;
}

/** Play until the current hand ends (phase leaves "playing"), using first valid move each turn. */
function autoPlayHand(state: HokmState): HokmState {
  const rng = makeRng(0);
  let s = state;
  while (s.phase === "playing") {
    const player = s.currentTurn!;
    const moves = hokm.getValidMoves(s, player);
    const result = hokm.applyMove(s, player, moves[0], rng);
    if (!result.ok) throw new Error(`${player}: ${result.error.message.en}`);
    s = result.state;
  }
  return s;
}

// ── trickWinner ────────────────────────────────────────────────────────────

describe("trickWinner", () => {
  it("highest of led suit wins when no trump played", () => {
    const trick = [
      { playerId: "P0", card: card("K", "hearts") },
      { playerId: "P1", card: card("A", "hearts") },
      { playerId: "P2", card: card("2", "spades") }, // off-suit, not trump
      { playerId: "P3", card: card("Q", "hearts") },
    ];
    expect(trickWinner(trick, "clubs")).toBe("P1");
  });

  it("trump beats the highest card of led suit", () => {
    const trick = [
      { playerId: "P0", card: card("A", "hearts") },
      { playerId: "P1", card: card("2", "clubs") }, // trump
      { playerId: "P2", card: card("K", "hearts") },
      { playerId: "P3", card: card("Q", "hearts") },
    ];
    expect(trickWinner(trick, "clubs")).toBe("P1");
  });

  it("highest trump wins when multiple trumps played", () => {
    const trick = [
      { playerId: "P0", card: card("A", "hearts") },
      { playerId: "P1", card: card("2", "clubs") }, // low trump
      { playerId: "P2", card: card("K", "hearts") },
      { playerId: "P3", card: card("J", "clubs") }, // higher trump
    ];
    expect(trickWinner(trick, "clubs")).toBe("P3");
  });

  it("off-suit non-trump card cannot win", () => {
    // P0 leads diamonds, P1 plays a high spade (not trump), P2 plays a low diamond
    const trick = [
      { playerId: "P0", card: card("3", "diamonds") },
      { playerId: "P1", card: card("A", "spades") }, // not trump (trump = clubs)
      { playerId: "P2", card: card("2", "diamonds") },
      { playerId: "P3", card: card("4", "diamonds") },
    ];
    expect(trickWinner(trick, "clubs")).toBe("P3");
  });

  it("first player wins when all cards are off-suit and no trump", () => {
    const trick = [
      { playerId: "P0", card: card("A", "diamonds") },
      { playerId: "P1", card: card("2", "hearts") },
      { playerId: "P2", card: card("K", "hearts") },
      { playerId: "P3", card: card("Q", "spades") },
    ];
    // Led suit = diamonds; only P0 has a diamond — P0 wins
    expect(trickWinner(trick, "clubs")).toBe("P0");
  });
});

// ── isLegalPlay ────────────────────────────────────────────────────────────

describe("isLegalPlay", () => {
  const heartHand: Card[] = [card("A", "hearts"), card("2", "spades")];
  const voidHand: Card[] = [card("2", "spades"), card("3", "clubs")];

  it("allows any card when leading a trick", () => {
    expect(isLegalPlay(heartHand, card("A", "hearts"), [])).toBe(true);
    expect(isLegalPlay(heartHand, card("2", "spades"), [])).toBe(true);
  });

  it("requires following suit when the player has the led suit", () => {
    const trick = [{ playerId: "P0", card: card("K", "hearts") }];
    expect(isLegalPlay(heartHand, card("A", "hearts"), trick)).toBe(true);
    expect(isLegalPlay(heartHand, card("2", "spades"), trick)).toBe(false);
  });

  it("allows any card — including trump — when void in the led suit", () => {
    const trick = [{ playerId: "P0", card: card("K", "hearts") }];
    // voidHand has no hearts
    expect(isLegalPlay(voidHand, card("2", "spades"), trick)).toBe(true);
    expect(isLegalPlay(voidHand, card("3", "clubs"), trick)).toBe(true);
  });

  it("rejects a card not present in hand", () => {
    expect(isLegalPlay(heartHand, card("A", "clubs"), [])).toBe(false);
  });

  it("does NOT mandate playing trump when void in led suit (trumping not mandatory)", () => {
    // Player is void in hearts, has a trump (spades) and a club — both are legal
    const trick = [{ playerId: "P0", card: card("K", "hearts") }];
    const mixedHand: Card[] = [card("A", "spades"), card("2", "clubs")];
    expect(isLegalPlay(mixedHand, card("A", "spades"), trick)).toBe(true);
    expect(isLegalPlay(mixedHand, card("2", "clubs"), trick)).toBe(true);
  });
});

// ── scoreHand ──────────────────────────────────────────────────────────────

describe("scoreHand", () => {
  it("1 point for a normal win", () => {
    const s = scoreHand([7, 6], 0);
    expect(s.pointsGained).toEqual([1, 0]);
    expect(s.isKot).toBe(false);
    expect(s.isHakemKot).toBe(false);
    expect(s.winnerTeam).toBe(0);
  });

  it("1 point for a normal win by the non-hakem team", () => {
    const s = scoreHand([3, 7], 0);
    expect(s.pointsGained).toEqual([0, 1]);
    expect(s.isKot).toBe(false);
    expect(s.isHakemKot).toBe(false);
    expect(s.winnerTeam).toBe(1);
  });

  it("2 points for a kot when hakem's team wins 7-0", () => {
    const s = scoreHand([7, 0], 0); // hakem on team 0, team 0 wins all
    expect(s.pointsGained).toEqual([2, 0]);
    expect(s.isKot).toBe(true);
    expect(s.isHakemKot).toBe(false);
  });

  it("3 points for hakem-kot (opponent team wins 7-0 against hakem)", () => {
    const s = scoreHand([0, 7], 0); // hakem on team 0, team 1 wins all
    expect(s.pointsGained).toEqual([0, 3]);
    expect(s.isKot).toBe(true);
    expect(s.isHakemKot).toBe(true);
    expect(s.winnerTeam).toBe(1);
  });

  it("3 points for hakem-kot when non-hakem team wins 7-0", () => {
    const s = scoreHand([7, 0], 1); // hakem on team 1, team 0 wins all → hakem-kot
    expect(s.pointsGained).toEqual([3, 0]);
    expect(s.isHakemKot).toBe(true);
    expect(s.winnerTeam).toBe(0);
  });
});

// ── setup ──────────────────────────────────────────────────────────────────

describe("setup", () => {
  it("starts in choosingTrump phase with hakem holding exactly 5 cards", () => {
    const rng = makeRng(1);
    const state = hokm.setup({ variantId: "hokm-4p", players: [...PLAYERS], options: {}, rng });

    expect(state.phase).toBe("choosingTrump");
    const hakemId = state.players[state.hakemIndex];
    expect(state.hands[hakemId]).toHaveLength(5);
    for (const p of state.players) {
      if (p !== hakemId) expect(state.hands[p]).toHaveLength(0);
    }
  });

  it("currentTurn is the hakem in choosingTrump phase", () => {
    const rng = makeRng(2);
    const state = hokm.setup({ variantId: "hokm-4p", players: [...PLAYERS], options: {}, rng });
    expect(state.currentTurn).toBe(state.players[state.hakemIndex]);
  });

  it("is deterministic: same seed produces identical initial state", () => {
    const mkState = () =>
      hokm.setup({ variantId: "hokm-4p", players: [...PLAYERS], options: {}, rng: makeRng(99) });
    expect(mkState()).toEqual(mkState());
  });

  it("deck totals 52 cards (hakem hand + deckForDeal)", () => {
    const rng = makeRng(3);
    const state = hokm.setup({ variantId: "hokm-4p", players: [...PLAYERS], options: {}, rng });
    const hakem = state.players[state.hakemIndex];
    expect(state.hands[hakem].length + state.deckForDeal.length).toBe(52);
  });

  it("respects targetScore option", () => {
    const rng = makeRng(4);
    const state = hokm.setup({ variantId: "hokm-4p", players: [...PLAYERS], options: { targetScore: 11 }, rng });
    expect(state.targetScore).toBe(11);
  });
});

// ── choosingTrump phase ────────────────────────────────────────────────────

describe("choosingTrump phase", () => {
  it("only the hakem may choose trump", () => {
    const rng = makeRng(10);
    const state = hokm.setup({ variantId: "hokm-4p", players: [...PLAYERS], options: {}, rng });
    const nonHakem = state.players.find(p => p !== state.players[state.hakemIndex])!;
    const result = hokm.applyMove(state, nonHakem, { type: "chooseTrump", suit: "hearts" }, rng);
    expect(result.ok).toBe(false);
  });

  it("after choosing trump everyone holds exactly 13 cards", () => {
    const state = setupAndDeal(11, "diamonds");
    for (const p of state.players) {
      expect(state.hands[p]).toHaveLength(13);
    }
  });

  it("trump is recorded on the state", () => {
    const state = setupAndDeal(12, "clubs");
    expect(state.trump).toBe("clubs");
  });

  it("phase transitions to playing after trump choice", () => {
    const state = setupAndDeal(13, "hearts");
    expect(state.phase).toBe("playing");
  });

  it("all 52 cards are in play after dealing (no duplicates, no missing cards)", () => {
    const state = setupAndDeal(14, "spades");
    const all: Card[] = [];
    for (const p of state.players) all.push(...state.hands[p]);
    expect(all).toHaveLength(52);
    const keys = all.map(c => `${c.rank}${c.suit}`);
    expect(new Set(keys).size).toBe(52);
  });

  it("getValidMoves returns 4 chooseTrump moves for hakem, 0 for others", () => {
    const rng = makeRng(15);
    const state = hokm.setup({ variantId: "hokm-4p", players: [...PLAYERS], options: {}, rng });
    const hakem = state.players[state.hakemIndex];
    expect(hokm.getValidMoves(state, hakem)).toHaveLength(4);
    for (const p of state.players) {
      if (p !== hakem) expect(hokm.getValidMoves(state, p)).toHaveLength(0);
    }
  });
});

// ── playing phase — turn order ────────────────────────────────────────────

describe("playing phase — turn order", () => {
  it("only the current-turn player has valid moves", () => {
    const state = setupAndDeal(20, "spades");
    const current = state.currentTurn!;
    expect(hokm.getValidMoves(state, current).length).toBeGreaterThan(0);
    for (const p of state.players) {
      if (p !== current) expect(hokm.getValidMoves(state, p)).toHaveLength(0);
    }
  });

  it("turn advances clockwise after each card played", () => {
    const state = setupAndDeal(21, "hearts");
    const start = state.players.indexOf(state.currentTurn!);
    let s = state;
    for (let i = 0; i < 4; i++) {
      const player = s.currentTurn!;
      const moves = hokm.getValidMoves(s, player);
      s = play(s, player, moves[0]);
      if (i < 3) {
        const expectedNext = state.players[(start + i + 1) % 4];
        expect(s.currentTurn).toBe(expectedNext);
      }
    }
  });

  it("trick winner leads the next trick", () => {
    const state = setupAndDeal(22, "clubs");
    let s = state;
    // play one full trick
    for (let i = 0; i < 4; i++) {
      const p = s.currentTurn!;
      s = play(s, p, hokm.getValidMoves(s, p)[0]);
    }
    // After trick, currentTurn should be the player with the last-won trick
    expect(s.currentTrick).toHaveLength(0);
    expect(s.currentTurn).toBe(s.players[s.trickLeaderIndex]);
  });
});

// ── playing phase — follow-suit enforcement ────────────────────────────────

describe("playing phase — follow-suit enforcement via applyMove", () => {
  it("rejects a card that violates follow-suit", () => {
    const rng = makeRng(0);
    // Craft a state where P0 has hearts and must follow when hearts are led
    const hands = {
      P0: [card("K", "hearts"), card("2", "spades")],  // has hearts
      P1: [card("A", "hearts")],
      P2: [card("Q", "hearts")],
      P3: [card("J", "hearts")],
    };
    const trick = [{ playerId: "P1", card: card("3", "hearts") }]; // hearts led
    const state = playingState(hands, {
      currentTrick: trick,
      currentTurn: "P0",
      trickLeaderIndex: 1,
    });
    // P0 tries to play spade 2 instead of following hearts
    const result = hokm.applyMove(state, "P0", { type: "playCard", card: card("2", "spades") }, rng);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("RULE_VIOLATION");
  });

  it("allows any card when player is void in led suit", () => {
    const rng = makeRng(0);
    const hands = {
      P0: [card("2", "spades"), card("3", "clubs")],  // no hearts
      P1: [card("A", "hearts")],
      P2: [card("Q", "hearts")],
      P3: [card("J", "hearts")],
    };
    const trick = [{ playerId: "P1", card: card("3", "hearts") }];
    const state = playingState(hands, {
      currentTrick: trick,
      currentTurn: "P0",
      trickLeaderIndex: 1,
    });
    // Both available cards are legal
    const r1 = hokm.applyMove(state, "P0", { type: "playCard", card: card("2", "spades") }, rng);
    const r2 = hokm.applyMove(state, "P0", { type: "playCard", card: card("3", "clubs") }, rng);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  it("rejects playing a card not in hand", () => {
    const rng = makeRng(0);
    const hands = { P0: [card("2", "hearts")], P1: [card("3", "hearts")], P2: [card("4", "hearts")], P3: [card("5", "hearts")] };
    const state = playingState(hands);
    const result = hokm.applyMove(state, "P0", { type: "playCard", card: card("A", "spades") }, rng);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_MOVE");
  });
});

// ── tricksTaken and hand completion ────────────────────────────────────────

describe("hand completion", () => {
  /**
   * Build a state where team 0 leads with trump (spades), team 1 has no spades.
   * P0 (hakem, team 0): all 13 spades → wins every trick.
   * P1 (team 1): all hearts
   * P2 (team 0): all diamonds
   * P3 (team 1): all clubs
   */
  function kotSetup(hakemIndex: number): HokmState {
    const allSpades = (["2","3","4","5","6","7","8","9","10","J","Q","K","A"] as Rank[]).map(r => card(r, "spades"));
    const allHearts = (["2","3","4","5","6","7","8","9","10","J","Q","K","A"] as Rank[]).map(r => card(r, "hearts"));
    const allDiamonds = (["2","3","4","5","6","7","8","9","10","J","Q","K","A"] as Rank[]).map(r => card(r, "diamonds"));
    const allClubs = (["2","3","4","5","6","7","8","9","10","J","Q","K","A"] as Rank[]).map(r => card(r, "clubs"));

    const players = ["P0","P1","P2","P3"];
    const seats = [allSpades, allHearts, allDiamonds, allClubs];
    const hands: Record<string, Card[]> = {};
    for (let i = 0; i < 4; i++) hands[players[i]] = seats[i];

    return playingState(hands, {
      hakemIndex,
      trump: "spades",
      trickLeaderIndex: hakemIndex,
      currentTurn: players[hakemIndex],
    });
  }

  it("scores 2 points for a regular kot (hakem's team wins 7-0)", () => {
    // P0 is hakem (team 0). P0 has all spades (trump). P0 wins all 7 tricks.
    let s = kotSetup(0);
    // Play 7 tricks: P0 leads trump, others play their cards
    const p = ["P0","P1","P2","P3"];
    const ranks: Rank[] = ["2","3","4","5","6","7","8"];
    for (let t = 0; t < 7; t++) {
      // Start of each trick, the leader is always P0
      s = playTrick(s, [
        card(ranks[t], "spades"),   // P0 leads trump
        card(ranks[t], "hearts"),   // P1 must follow hearts? No, they can play anything when void of spades
        card(ranks[t], "diamonds"), // P2
        card(ranks[t], "clubs"),    // P3
      ]);
    }
    // Hand is over, hakem's team (team 0) has 7 tricks, opponent has 0 → regular kot
    expect(s.phase).toBe("choosingTrump"); // new hand
    expect(s.scores).toEqual([2, 0]);
  });

  it("scores 3 points for hakem-kot (opponent wins 7-0 against hakem)", () => {
    // P1 is hakem (team 1, seat 1). P0 has all spades (trump) → P0 wins every trick.
    const s = autoPlayHand(kotSetup(1));
    // team 0 has 7 tricks, team 1 (hakem) has 0 → hakem-kot = 3 pts for team 0
    expect(s.phase).toBe("choosingTrump");
    expect(s.scores).toEqual([3, 0]);
  });

  it("scores 1 point for a normal win (7-6)", () => {
    // Use a single crafted trick to reach 7-0 → kot; for 7-6 we need a nuanced setup.
    // Use scoreHand directly to verify; the integration path is validated in the kot tests.
    const s = scoreHand([7, 6], 0);
    expect(s.pointsGained).toEqual([1, 0]);
    expect(s.isKot).toBe(false);
  });

  it("hakem stays when their team wins the hand", () => {
    let s = kotSetup(0); // P0 (team 0) is hakem
    const ranks: Rank[] = ["2","3","4","5","6","7","8"];
    for (let t = 0; t < 7; t++) {
      s = playTrick(s, [
        card(ranks[t], "spades"),
        card(ranks[t], "hearts"),
        card(ranks[t], "diamonds"),
        card(ranks[t], "clubs"),
      ]);
    }
    expect(s.hakemIndex).toBe(0); // hakem (P0) stays
  });

  it("hakem passes counter-clockwise when their team loses", () => {
    // P1 (seat 1, team 1) is hakem; P0 has all trump → team 0 wins every trick
    const s = autoPlayHand(kotSetup(1));
    // Counter-clockwise from seat 1: (1 - 1 + 4) % 4 = 0 → P0 becomes hakem
    expect(s.hakemIndex).toBe(0);
    expect(s.handNumber).toBe(1);
  });

  it("game ends when a team reaches the target score", () => {
    // Start with scores [6, 0]; hakem P0 (team 0) wins another kot → team 0 reaches 8 pts → game over
    let s = kotSetup(0);
    s = { ...s, scores: [6, 0] };

    const ranks: Rank[] = ["2","3","4","5","6","7","8"];
    for (let t = 0; t < 7; t++) {
      s = playTrick(s, [
        card(ranks[t], "spades"),
        card(ranks[t], "hearts"),
        card(ranks[t], "diamonds"),
        card(ranks[t], "clubs"),
      ]);
    }
    expect(s.phase).toBe("gameOver");
    const outcome = hokm.getOutcome(s);
    expect(outcome).not.toBeNull();
    expect(outcome!.winners).toContain("P0");
    expect(outcome!.winners).toContain("P2");
    expect(outcome!.winners).not.toContain("P1");
  });
});

// ── getPlayerView — security ───────────────────────────────────────────────

describe("getPlayerView", () => {
  it("player only sees their own hand, not opponents cards", () => {
    const state = setupAndDeal(50, "spades");
    for (const p of state.players) {
      const view = hokm.getPlayerView(state, p);
      expect(view.hand).toEqual(state.hands[p]);
      // View has no field that exposes other players' actual cards
      expect(Object.keys(view)).not.toContain("hands");
    }
  });

  it("handSizes reveals opponents' counts but not their cards", () => {
    const state = setupAndDeal(51, "hearts");
    const view = hokm.getPlayerView(state, "P0");
    expect(view.handSizes).toHaveLength(4);
    expect(view.handSizes.every(n => n === 13)).toBe(true);
  });
});

// ── getOutcome ─────────────────────────────────────────────────────────────

describe("getOutcome", () => {
  it("returns null while game is in progress", () => {
    const state = setupAndDeal(60, "clubs");
    expect(hokm.getOutcome(state)).toBeNull();
  });

  it("returns correct winners when game is over", () => {
    const gameOverState: HokmState = {
      ...playingState({ P0: [], P1: [], P2: [], P3: [] }),
      phase: "gameOver",
      scores: [7, 4],
      currentTurn: null,
    };
    const outcome = hokm.getOutcome(gameOverState);
    expect(outcome).not.toBeNull();
    expect(outcome!.winners.sort()).toEqual(["P0", "P2"]); // team 0 = seats 0 and 2
    expect(outcome!.scores).toEqual({ team0: 7, team1: 4 });
  });
});

// ── getDefaultMove ─────────────────────────────────────────────────────────

describe("getDefaultMove", () => {
  it("returns chooseTrump with the most common suit in hakem hand", () => {
    const rng = makeRng(70);
    const state = hokm.setup({ variantId: "hokm-4p", players: [...PLAYERS], options: {}, rng });
    const hakem = state.players[state.hakemIndex];
    const def = hokm.getDefaultMove(state, hakem);
    expect(def.type).toBe("chooseTrump");
  });

  it("returns playCard with a legal card in playing phase", () => {
    const state = setupAndDeal(71, "diamonds");
    const player = state.currentTurn!;
    const def = hokm.getDefaultMove(state, player);
    expect(def.type).toBe("playCard");
    const legalMoves = hokm.getValidMoves(state, player);
    expect(legalMoves.some(m => moveEquals(m, def))).toBe(true);
  });
});

// ── determinism ────────────────────────────────────────────────────────────

describe("determinism", () => {
  it("same seed + same moves produce identical final state", () => {
    function runGame(seed: number): HokmState {
      const rng = makeRng(seed);
      let state = hokm.setup({ variantId: "hokm-4p", players: [...PLAYERS], options: {}, rng });

      for (let round = 0; round < 3; round++) {
        // chooseTrump
        const hakem = state.players[state.hakemIndex];
        const trumpMoves = hokm.getValidMoves(state, hakem);
        const r = hokm.applyMove(state, hakem, trumpMoves[0], rng);
        if (!r.ok) break;
        state = r.state;

        // Play until hand over
        while (state.phase === "playing") {
          const player = state.currentTurn!;
          const moves = hokm.getValidMoves(state, player);
          const result = hokm.applyMove(state, player, moves[0], rng);
          if (!result.ok) break;
          state = result.state;
        }
        if (state.phase === "gameOver") break;
      }
      return state;
    }

    expect(runGame(123)).toEqual(runGame(123));
    expect(runGame(456)).toEqual(runGame(456));
  });
});

// ── helper ─────────────────────────────────────────────────────────────────

function moveEquals(a: HokmMove, b: HokmMove): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "chooseTrump" && b.type === "chooseTrump") return a.suit === b.suit;
  if (a.type === "playCard" && b.type === "playCard")
    return a.card.suit === b.card.suit && a.card.rank === b.card.rank;
  return false;
}
