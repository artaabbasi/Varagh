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
    teamMap: { P0: 0, P1: 1, P2: 0, P3: 1 },
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

// ═══════════════════════════════════════════════════════════════════════════
// 3-PLAYER HOKM TESTS
// ═══════════════════════════════════════════════════════════════════════════

// ── 3p test helpers ────────────────────────────────────────────────────────

const RANKS_ALL = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"] as const;
type AllRank = typeof RANKS_ALL[number];

/** Build a minimal 3p playing state. Hakem = "A" (index 0), trump = spades. */
function playingState3p(
  hands: Record<string, Card[]>,
  overrides: Partial<HokmState> = {}
): HokmState {
  return {
    phase: "playing",
    players: ["A", "B", "C"],
    hakemIndex: 0,
    trump: "spades",
    teamMap: { A: 0, B: 1, C: 1 },
    hands,
    deckForDeal: [],
    currentTrick: [],
    trickLeaderIndex: 0,
    currentTurn: "A",
    tricksTaken: [0, 0],
    scores: [0, 0, 0],
    handNumber: 0,
    targetScore: 7,
    ...overrides,
  };
}

/**
 * A (hakem, index 0) holds all 13 spades (trump) + 4 lowest hearts.
 * B holds 8 hearts + 9 clubs. C holds 13 diamonds + 4 clubs.
 * A leads trump every trick → A wins all 7 tricks → regular kot.
 * Suit totals: spades=13, hearts=4+8=12 (no 2♥), diamonds=13, clubs=9+4=13 = 51 ✓
 */
function hakemWinsAllSetup3p(): HokmState {
  const allSpades  = RANKS_ALL.map(r => card(r, "spades"));
  const lowHearts  = (["3","4","5","6"] as AllRank[]).map(r => card(r, "hearts")); // 4 for A
  const highHearts = (["7","8","9","10","J","Q","K","A"] as AllRank[]).map(r => card(r, "hearts")); // 8 for B
  const allDiamonds = RANKS_ALL.map(r => card(r, "diamonds"));
  const lowClubs   = (["2","3","4","5","6","7","8","9","10"] as AllRank[]).map(r => card(r, "clubs")); // 9 for B
  const highClubs  = (["J","Q","K","A"] as AllRank[]).map(r => card(r, "clubs")); // 4 for C

  return playingState3p({
    A: [...allSpades, ...lowHearts],   // 13 + 4 = 17
    B: [...highHearts, ...lowClubs],   // 8 + 9 = 17
    C: [...allDiamonds, ...highClubs], // 13 + 4 = 17
  });
}

/**
 * B holds all 13 spades (trump) + 4 clubs. A (hakem) holds 12 hearts + 5 diamonds.
 * C holds 8 diamonds + 9 clubs.
 * B wins every trick → tricksTaken[1] reaches 7 → hakem-kot.
 * Suit totals: spades=13, hearts=12 (no 2♥), diamonds=5+8=13, clubs=4+9=13 = 51 ✓
 */
function opponentsWinAllSetup3p(): HokmState {
  const allSpades  = RANKS_ALL.map(r => card(r, "spades"));
  const allHearts  = (["3","4","5","6","7","8","9","10","J","Q","K","A"] as AllRank[]).map(r => card(r, "hearts")); // 12
  const lowDiamonds  = (["2","3","4","5","6"] as AllRank[]).map(r => card(r, "diamonds")); // 5 for A
  const highDiamonds = (["7","8","9","10","J","Q","K","A"] as AllRank[]).map(r => card(r, "diamonds")); // 8 for C
  const lowClubs  = (["2","3","4","5"] as AllRank[]).map(r => card(r, "clubs")); // 4 for B
  const highClubs = (["6","7","8","9","10","J","Q","K","A"] as AllRank[]).map(r => card(r, "clubs")); // 9 for C

  return playingState3p({
    A: [...allHearts, ...lowDiamonds],   // 12 + 5 = 17
    B: [...allSpades, ...lowClubs],      // 13 + 4 = 17
    C: [...highDiamonds, ...highClubs],  // 8 + 9 = 17
  });
}

// ── 3p setup and deal ──────────────────────────────────────────────────────

describe("3p — setup and deal", () => {
  it("starts in choosingTrump with hakem holding exactly 5 cards", () => {
    const rng = makeRng(1);
    const s = hokm.setup({ variantId: "hokm-3p", players: ["A", "B", "C"], options: {}, rng });
    expect(s.phase).toBe("choosingTrump");
    const hakemId = s.players[s.hakemIndex];
    expect(s.hands[hakemId]).toHaveLength(5);
    for (const p of s.players) {
      if (p !== hakemId) expect(s.hands[p]).toHaveLength(0);
    }
  });

  it("hakem hand + deckForDeal totals 51 cards", () => {
    const rng = makeRng(2);
    const s = hokm.setup({ variantId: "hokm-3p", players: ["A", "B", "C"], options: {}, rng });
    const hakem = s.players[s.hakemIndex];
    expect(s.hands[hakem].length + s.deckForDeal.length).toBe(51);
  });

  it("17 cards per player after choosing trump, no 2♥ anywhere, 51 unique cards", () => {
    const rng = makeRng(3);
    const s0 = hokm.setup({ variantId: "hokm-3p", players: ["A", "B", "C"], options: {}, rng });
    const hakem = s0.players[s0.hakemIndex];
    const r = hokm.applyMove(s0, hakem, { type: "chooseTrump", suit: "spades" }, rng);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error.message.en);
    const s = r.state;

    const allCards: Card[] = [];
    for (const p of s.players) {
      expect(s.hands[p]).toHaveLength(17);
      allCards.push(...s.hands[p]);
    }
    expect(allCards).toHaveLength(51);
    const keys = new Set(allCards.map(c => `${c.rank}${c.suit}`));
    expect(keys.size).toBe(51);
    expect(keys.has("2hearts")).toBe(false);
  });

  it("scores start as [0, 0, 0] for 3 players", () => {
    const rng = makeRng(4);
    const s = hokm.setup({ variantId: "hokm-3p", players: ["A", "B", "C"], options: {}, rng });
    expect(s.scores).toEqual([0, 0, 0]);
  });

  it("teamMap assigns hakem to slot 0 and both opponents to slot 1", () => {
    const rng = makeRng(5);
    const s = hokm.setup({ variantId: "hokm-3p", players: ["A", "B", "C"], options: {}, rng });
    const hakem = s.players[s.hakemIndex];
    expect(s.teamMap[hakem]).toBe(0);
    for (const p of s.players) {
      if (p !== hakem) expect(s.teamMap[p]).toBe(1);
    }
  });

  it("is deterministic: same seed produces identical initial state", () => {
    const mk = () =>
      hokm.setup({ variantId: "hokm-3p", players: ["A", "B", "C"], options: {}, rng: makeRng(77) });
    expect(mk()).toEqual(mk());
  });
});

// ── 3p trick counting ──────────────────────────────────────────────────────

describe("3p — trick counting and hand end condition", () => {
  it("B's and C's tricks are combined in tricksTaken[1]", () => {
    // Trick 1: B wins (plays trump). Trick 2: C wins (highest of led suit).
    const hands = {
      A: [card("3", "diamonds"), card("4", "diamonds")],
      B: [card("2", "spades"),   card("5", "clubs")],
      C: [card("A", "diamonds"), card("6", "clubs")],
    };
    let s = playingState3p(hands, { currentTurn: "A" });

    // A leads 3♦. B is void in diamonds → plays 2♠ (trump). C has A♦ → follows suit.
    // B wins with trump.
    s = playTrick(s, [card("3", "diamonds"), card("2", "spades"), card("A", "diamonds")]);
    expect(s.tricksTaken).toEqual([0, 1]);

    // B leads 5♣. C has 6♣ → must follow. A is void → plays 4♦. C's 6♣ beats B's 5♣. C wins.
    s = playTrick(s, [card("5", "clubs"), card("6", "clubs"), card("4", "diamonds")]);
    expect(s.tricksTaken).toEqual([0, 2]); // C's win also goes to slot 1
  });

  it("hand ends the moment hakem reaches 7 tricks (hakem leads trump every trick)", () => {
    const s = autoPlayHand(hakemWinsAllSetup3p());
    // A (hakem) wins all 7 tricks. Phase changes to choosingTrump (next hand).
    expect(s.phase).toBe("choosingTrump");
    expect(s.handNumber).toBe(1);
  });

  it("hand ends the moment combined opponents reach 7 tricks", () => {
    const s = autoPlayHand(opponentsWinAllSetup3p());
    // B wins all 7 tricks. Combined opponent count hits 7.
    expect(s.phase).toBe("choosingTrump");
    expect(s.handNumber).toBe(1);
  });
});

// ── 3p scoring ─────────────────────────────────────────────────────────────

describe("3p — scoring", () => {
  it("hakem normal win (7-6): hakem +1, opponents unchanged", () => {
    // tricksTaken=[6,6]; A leads A♠ (trump) → A wins the deciding trick.
    const hands = { A: [card("A", "spades")], B: [card("2", "hearts")], C: [card("3", "diamonds")] };
    let s = playingState3p(hands, { tricksTaken: [6, 6], currentTurn: "A", trickLeaderIndex: 0 });
    s = play(s, "A", { type: "playCard", card: card("A", "spades") });
    s = play(s, "B", { type: "playCard", card: card("2", "hearts") });
    s = play(s, "C", { type: "playCard", card: card("3", "diamonds") });
    // tricksTaken becomes [7, 6] → hakem wins normal → A +1
    expect(s.scores).toEqual([1, 0, 0]);
  });

  it("hakem kot (7-0): hakem +2, opponents unchanged", () => {
    const s = autoPlayHand(hakemWinsAllSetup3p());
    // A wins all 7 tricks → regular kot (opponents got 0) → A +2
    expect(s.scores).toEqual([2, 0, 0]);
  });

  it("opponents normal win (6-7): each opponent +1, hakem unchanged", () => {
    // tricksTaken=[6,6]; A leads 2♥, B plays A♠ (trump) → B wins the deciding trick.
    const hands = { A: [card("2", "hearts")], B: [card("A", "spades")], C: [card("3", "diamonds")] };
    let s = playingState3p(hands, { tricksTaken: [6, 6], currentTurn: "A", trickLeaderIndex: 0 });
    s = play(s, "A", { type: "playCard", card: card("2", "hearts") });
    s = play(s, "B", { type: "playCard", card: card("A", "spades") });
    s = play(s, "C", { type: "playCard", card: card("3", "diamonds") });
    // tricksTaken becomes [6, 7] → opponents win normal → B+1, C+1
    expect(s.scores).toEqual([0, 1, 1]);
  });

  it("hakem-kot (opponents win 7-0): each opponent +3, hakem unchanged", () => {
    const s = autoPlayHand(opponentsWinAllSetup3p());
    // B wins all 7 tricks; hakem (A) gets 0 → hakem-kot → B+3, C+3
    expect(s.scores).toEqual([0, 3, 3]);
  });

  it("accumulated scores persist across hands", () => {
    // Start with scores [2, 1, 0]; hakem wins a normal hand → A reaches 3
    const hands = { A: [card("A", "spades")], B: [card("2", "hearts")], C: [card("3", "diamonds")] };
    let s = playingState3p(hands, {
      tricksTaken: [6, 6],
      scores: [2, 1, 0],
      currentTurn: "A",
      trickLeaderIndex: 0,
    });
    s = play(s, "A", { type: "playCard", card: card("A", "spades") });
    s = play(s, "B", { type: "playCard", card: card("2", "hearts") });
    s = play(s, "C", { type: "playCard", card: card("3", "diamonds") });
    expect(s.scores).toEqual([3, 1, 0]); // A: 2+1=3, B unchanged, C unchanged
  });
});

// ── 3p hakem rotation ──────────────────────────────────────────────────────

describe("3p — hakem rotation", () => {
  it("hakem stays after winning a hand", () => {
    const s = autoPlayHand(hakemWinsAllSetup3p()); // A wins all 7 tricks
    expect(s.hakemIndex).toBe(0); // A stays hakem
    expect(s.handNumber).toBe(1);
  });

  it("hakem passes counter-clockwise after losing (index 0 → 2)", () => {
    const s = autoPlayHand(opponentsWinAllSetup3p()); // A loses (B wins all)
    // (0 - 1 + 3) % 3 = 2 → C becomes hakem
    expect(s.hakemIndex).toBe(2);
    expect(s.handNumber).toBe(1);
  });

  it("hakem passes counter-clockwise after losing (index 2 → 1)", () => {
    // Same card layout but C is hakem; B still holds all trump → C loses
    const base = opponentsWinAllSetup3p();
    const s = autoPlayHand({
      ...base,
      hakemIndex: 2,
      teamMap: { A: 1, B: 1, C: 0 },
      trickLeaderIndex: 2,
      currentTurn: "C",
    });
    // (2 - 1 + 3) % 3 = 1 → B becomes hakem
    expect(s.hakemIndex).toBe(1);
  });

  it("teamMap is rebuilt each hand to reflect the new hakem", () => {
    const s = autoPlayHand(opponentsWinAllSetup3p()); // A loses → C becomes hakem (index 2)
    // New hakem is C (index 2), so teamMap[C]=0, teamMap[A]=teamMap[B]=1
    expect(s.teamMap["C"]).toBe(0);
    expect(s.teamMap["A"]).toBe(1);
    expect(s.teamMap["B"]).toBe(1);
  });
});

// ── 3p game over ───────────────────────────────────────────────────────────

describe("3p — game over and getOutcome", () => {
  it("game ends when a player reaches targetScore", () => {
    // Scores [6,0,0]: A needs 1 more; A wins a normal hand (A wins deciding trick).
    const hands = { A: [card("A", "spades")], B: [card("2", "hearts")], C: [card("3", "diamonds")] };
    let s = playingState3p(hands, {
      tricksTaken: [6, 6],
      scores: [6, 0, 0],
      currentTurn: "A",
      trickLeaderIndex: 0,
    });
    s = play(s, "A", { type: "playCard", card: card("A", "spades") });
    s = play(s, "B", { type: "playCard", card: card("2", "hearts") });
    s = play(s, "C", { type: "playCard", card: card("3", "diamonds") });
    expect(s.phase).toBe("gameOver");
    const outcome = hokm.getOutcome(s);
    expect(outcome).not.toBeNull();
    expect(outcome!.winners).toEqual(["A"]);
  });

  it("getOutcome returns single winner and per-player scores", () => {
    const gameOverState: HokmState = {
      ...playingState3p({ A: [], B: [], C: [] }),
      phase: "gameOver",
      scores: [7, 3, 5],
      currentTurn: null,
    };
    const outcome = hokm.getOutcome(gameOverState);
    expect(outcome).not.toBeNull();
    expect(outcome!.winners).toEqual(["A"]);
    expect(outcome!.scores).toEqual({ A: 7, B: 3, C: 5 });
  });

  it("getOutcome returns null while game is in progress", () => {
    const rng = makeRng(80);
    const s = hokm.setup({ variantId: "hokm-3p", players: ["A", "B", "C"], options: {}, rng });
    expect(hokm.getOutcome(s)).toBeNull();
  });
});

// ── 3p view security ───────────────────────────────────────────────────────

describe("3p — getPlayerView security", () => {
  it("each player sees only their own hand, not opponents cards", () => {
    const rng = makeRng(90);
    const s0 = hokm.setup({ variantId: "hokm-3p", players: ["A", "B", "C"], options: {}, rng });
    const hakem = s0.players[s0.hakemIndex];
    const r = hokm.applyMove(s0, hakem, { type: "chooseTrump", suit: "hearts" }, rng);
    if (!r.ok) throw new Error(r.error.message.en);
    const s = r.state;
    for (const p of s.players) {
      const view = hokm.getPlayerView(s, p);
      expect(view.hand).toEqual(s.hands[p]);
      expect(Object.keys(view)).not.toContain("hands");
      expect(view.handSizes).toHaveLength(3);
      expect(view.handSizes.every(n => n === 17)).toBe(true);
    }
  });
});

// ── 3p determinism ─────────────────────────────────────────────────────────

describe("3p — determinism", () => {
  it("same seed + same moves produce identical final state", () => {
    function run3pGame(seed: number): HokmState {
      const rng = makeRng(seed);
      let state = hokm.setup({ variantId: "hokm-3p", players: ["A", "B", "C"], options: {}, rng });
      for (let round = 0; round < 3; round++) {
        const hakem = state.players[state.hakemIndex];
        const trumpMoves = hokm.getValidMoves(state, hakem);
        const r = hokm.applyMove(state, hakem, trumpMoves[0], rng);
        if (!r.ok) break;
        state = r.state;
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
    expect(run3pGame(42)).toEqual(run3pGame(42));
    expect(run3pGame(999)).toEqual(run3pGame(999));
  });
});
