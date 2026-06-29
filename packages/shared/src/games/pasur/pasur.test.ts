import { describe, expect, it } from "vitest";
import type { Card, Rank, Suit } from "../../engine/game-engine";
import { makeRng } from "../../engine/rng";
import { pasur } from "./index";
import { pasurBotMove } from "./bot";
import type { PasurMove, PasurState } from "./state";
import { finalScores, sameCard, sameCardSet, tally } from "./rules";

// ── Helpers ──────────────────────────────────────────────────────────────────

const PLAYERS = ["P0", "P1"] as const;

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

/** A minimal 2-player playing state; override anything you care about. */
function st(overrides: Partial<PasurState> = {}): PasurState {
  return {
    phase: "playing",
    players: [...PLAYERS],
    hands: { P0: [], P1: [] },
    pool: [],
    captured: { P0: [], P1: [] },
    surs: { P0: 0, P1: 0 },
    deck: [],
    currentTurn: "P0",
    leaderIndex: 0,
    lastCapturer: null,
    isFinalDeal: false,
    options: { surDisabledAt50: false, surTitForTat: false, multiCapture: false },
    baseScores: { P0: 0, P1: 0 },
    // Default to a 1-point target so single-round rule tests reach gameOver as
    // soon as a round is tallied; multi-round tests set their own target.
    targetScore: 1,
    roundNumber: 0,
    ...overrides,
  };
}

function apply(state: PasurState, player: string, move: PasurMove): PasurState {
  const r = pasur.applyMove(state, player, move, makeRng(0));
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.error.message.en);
  return r.state;
}

/** Find the legal move that plays `c`, optionally taking a specific capture set. */
function moveFor(state: PasurState, player: string, c: Card, capture?: Card[]): PasurMove {
  const forCard = pasur.getValidMoves(state, player).filter((m) => sameCard(m.card, c));
  if (capture === undefined) return forCard[0];
  const found = forCard.find((m) => sameCardSet(m.capture, capture));
  if (!found) throw new Error(`No move for ${c.rank}${c.suit} capturing the given set`);
  return found;
}

function keys(cards: Card[]): string[] {
  return cards.map((c) => `${c.rank}-${c.suit}`).sort();
}

// ── Capture by sum-to-11 (single combination) ────────────────────────────────

describe("Pasur — sum-to-11 capture", () => {
  it("a numeral captures the pool numerals summing with it to 11", () => {
    const s = st({
      pool: [card("6", "hearts"), card("K", "diamonds")],
      hands: { P0: [card("5", "spades")], P1: [card("2", "clubs")] },
    });
    const after = apply(s, "P0", moveFor(s, "P0", card("5", "spades"), [card("6", "hearts")]));
    expect(keys(after.captured.P0)).toEqual(keys([card("5", "spades"), card("6", "hearts")]));
    expect(keys(after.pool)).toEqual(keys([card("K", "diamonds")])); // K untouched
    expect(after.lastCapturer).toBe("P0");
  });

  it("Ace counts as 1 (captures a 10)", () => {
    const s = st({
      pool: [card("10", "hearts"), card("K", "spades")],
      hands: { P0: [card("A", "spades")], P1: [card("2", "clubs")] },
    });
    const after = apply(s, "P0", moveFor(s, "P0", card("A", "spades"), [card("10", "hearts")]));
    expect(keys(after.captured.P0)).toEqual(keys([card("A", "spades"), card("10", "hearts")]));
  });

  it("a numeral never captures Queens or Kings", () => {
    const s = st({
      pool: [card("Q", "spades"), card("5", "hearts")],
      hands: { P0: [card("6", "spades")], P1: [card("2", "clubs")] },
    });
    // 6 needs sum 5 → only the 5♥; the Queen is not a numeral and stays.
    const moves = pasur.getValidMoves(s, "P0").filter((m) => sameCard(m.card, card("6", "spades")));
    expect(moves).toHaveLength(1);
    expect(keys(moves[0].capture)).toEqual(keys([card("5", "hearts")]));
  });
});

// ── Multi-combination, toggle OFF and ON ─────────────────────────────────────

describe("Pasur — multiple sum-to-11 combinations", () => {
  const pool = [card("3", "hearts"), card("3", "diamonds"), card("8", "clubs")];

  it("OFF: each distinct combination is its own move; taking one leaves the rest", () => {
    const s = st({ hands: { P0: [card("8", "spades")], P1: [card("A", "clubs")] }, pool });
    const moves = pasur.getValidMoves(s, "P0").filter((m) => sameCard(m.card, card("8", "spades")));
    // 8 needs sum 3 → {3♥} or {3♦}: two distinct moves.
    expect(moves).toHaveLength(2);

    const after = apply(s, "P0", moveFor(s, "P0", card("8", "spades"), [card("3", "hearts")]));
    expect(keys(after.captured.P0)).toEqual(keys([card("8", "spades"), card("3", "hearts")]));
    // The other 3 and the 8♣ remain in the pool.
    expect(keys(after.pool)).toEqual(keys([card("3", "diamonds"), card("8", "clubs")]));
  });

  it("ON: one move takes the union of every combination", () => {
    const s = st({
      hands: { P0: [card("8", "spades")], P1: [card("A", "clubs")] },
      pool,
      options: { surDisabledAt50: false, surTitForTat: false, multiCapture: true },
    });
    const moves = pasur.getValidMoves(s, "P0").filter((m) => sameCard(m.card, card("8", "spades")));
    expect(moves).toHaveLength(1);
    expect(keys(moves[0].capture)).toEqual(keys([card("3", "hearts"), card("3", "diamonds")]));

    const after = apply(s, "P0", moves[0]);
    expect(keys(after.pool)).toEqual(keys([card("8", "clubs")]));
  });
});

// ── Jack sweep ───────────────────────────────────────────────────────────────

describe("Pasur — Jack", () => {
  it("captures every numeral and Jack, but never Queens or Kings", () => {
    const s = st({
      pool: [card("5", "hearts"), card("J", "diamonds"), card("Q", "spades"), card("K", "clubs")],
      hands: { P0: [card("J", "hearts")], P1: [card("2", "clubs")] },
    });
    const after = apply(s, "P0", moveFor(s, "P0", card("J", "hearts")));
    expect(keys(after.captured.P0)).toEqual(
      keys([card("J", "hearts"), card("5", "hearts"), card("J", "diamonds")]),
    );
    expect(keys(after.pool)).toEqual(keys([card("Q", "spades"), card("K", "clubs")]));
  });

  it("clearing the pool with a Jack scores no Sur", () => {
    const s = st({
      pool: [card("5", "hearts"), card("J", "diamonds")],
      hands: { P0: [card("J", "hearts")], P1: [card("2", "clubs")] },
    });
    const after = apply(s, "P0", moveFor(s, "P0", card("J", "hearts")));
    expect(after.pool).toHaveLength(0); // pool cleared
    expect(after.surs.P0).toBe(0); // but no Sur — it was a Jack
  });
});

// ── Queen / King rank-match ──────────────────────────────────────────────────

describe("Pasur — Queen/King rank match", () => {
  it("a Queen captures Queens by rank, leaving Kings and numerals", () => {
    const s = st({
      pool: [card("Q", "spades"), card("Q", "diamonds"), card("K", "clubs"), card("5", "hearts")],
      hands: { P0: [card("Q", "hearts")], P1: [card("2", "clubs")] },
    });
    const after = apply(s, "P0", moveFor(s, "P0", card("Q", "hearts")));
    expect(keys(after.captured.P0)).toEqual(
      keys([card("Q", "hearts"), card("Q", "spades"), card("Q", "diamonds")]),
    );
    expect(keys(after.pool)).toEqual(keys([card("K", "clubs"), card("5", "hearts")]));
  });

  it("a King with no matching King in the pool just lays down", () => {
    const s = st({
      pool: [card("5", "hearts")],
      hands: { P0: [card("K", "hearts")], P1: [card("2", "clubs")] },
    });
    const after = apply(s, "P0", moveFor(s, "P0", card("K", "hearts")));
    expect(after.captured.P0).toHaveLength(0);
    expect(keys(after.pool)).toEqual(keys([card("5", "hearts"), card("K", "hearts")]));
  });
});

// ── No-capture lay-down ──────────────────────────────────────────────────────

describe("Pasur — no-capture play", () => {
  it("a card that captures nothing stays face-up in the pool", () => {
    const s = st({
      pool: [card("K", "diamonds")],
      hands: { P0: [card("9", "spades")], P1: [card("2", "clubs")] },
    });
    const moves = pasur.getValidMoves(s, "P0").filter((m) => sameCard(m.card, card("9", "spades")));
    expect(moves).toHaveLength(1);
    expect(moves[0].capture).toHaveLength(0);

    const after = apply(s, "P0", moves[0]);
    expect(keys(after.pool)).toEqual(keys([card("K", "diamonds"), card("9", "spades")]));
    expect(after.lastCapturer).toBeNull();
  });
});

// ── Sur detection and enforced exceptions ────────────────────────────────────

describe("Pasur — Sur", () => {
  it("clearing the pool with a numeral capture scores a Sur", () => {
    const s = st({
      pool: [card("6", "hearts")],
      hands: { P0: [card("5", "spades")], P1: [card("2", "clubs")] },
      isFinalDeal: false,
    });
    const after = apply(s, "P0", moveFor(s, "P0", card("5", "spades"), [card("6", "hearts")]));
    expect(after.pool).toHaveLength(0);
    expect(after.surs.P0).toBe(1);
  });

  it("no Sur on the final deal", () => {
    const s = st({
      pool: [card("6", "hearts")],
      hands: { P0: [card("5", "spades")], P1: [card("2", "clubs")] },
      isFinalDeal: true,
    });
    const after = apply(s, "P0", moveFor(s, "P0", card("5", "spades"), [card("6", "hearts")]));
    expect(after.pool).toHaveLength(0);
    expect(after.surs.P0).toBe(0);
  });
});

// ── Toggle: Sur disabled at 50+ ──────────────────────────────────────────────

describe("Pasur — toggle: no Sur at 50+ points", () => {
  const base = (surDisabledAt50: boolean) =>
    st({
      surs: { P0: 2, P1: 1 },
      baseScores: { P0: 52, P1: 0 },
      options: { surDisabledAt50, surTitForTat: false, multiCapture: false },
    });

  it("OFF: a player at 50+ still scores their Surs", () => {
    const t = tally(base(false));
    expect(t.P0.surPoints).toBe(10); // 2 surs × 5
    expect(t.P1.surPoints).toBe(5);
  });

  it("ON: a player at 50+ scores no Surs; others unaffected", () => {
    const t = tally(base(true));
    expect(t.P0.surPoints).toBe(0);
    expect(t.P1.surPoints).toBe(5);
  });
});

// ── Toggle: tit-for-tat (net Surs only) ──────────────────────────────────────

describe("Pasur — toggle: net Surs only", () => {
  const base = (surTitForTat: boolean) =>
    st({
      surs: { P0: 3, P1: 1 },
      options: { surDisabledAt50: false, surTitForTat, multiCapture: false },
    });

  it("OFF: every Sur scores", () => {
    const t = tally(base(false));
    expect(t.P0.scoringSurs).toBe(3);
    expect(t.P1.scoringSurs).toBe(1);
  });

  it("ON: only the net difference scores", () => {
    const t = tally(base(true));
    expect(t.P0.scoringSurs).toBe(2); // 3 − 1
    expect(t.P1.scoringSurs).toBe(0);
  });
});

// ── Deterministic opening-pool Jack replacement ──────────────────────────────

describe("Pasur — opening pool", () => {
  it("never contains a Jack, across many seeds, and conserves all 52 cards", () => {
    for (let seed = 0; seed < 60; seed++) {
      const s = pasur.setup({ variantId: "pasur-2p", players: [...PLAYERS], options: {}, rng: makeRng(seed) });
      expect(s.pool).toHaveLength(4);
      expect(s.pool.every((c) => c.rank !== "J")).toBe(true);

      const all = [...s.pool, ...s.deck, ...s.hands.P0, ...s.hands.P1];
      expect(all).toHaveLength(52);
      expect(new Set(all.map((c) => `${c.rank}-${c.suit}`)).size).toBe(52);
    }
  });

  it("is deterministic for a given seed", () => {
    const a = pasur.setup({ variantId: "pasur-2p", players: [...PLAYERS], options: {}, rng: makeRng(7) });
    const b = pasur.setup({ variantId: "pasur-2p", players: [...PLAYERS], options: {}, rng: makeRng(7) });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ── Last capturer takes the leftover pool at deck-out ─────────────────────────

describe("Pasur — end of round", () => {
  it("leftover pool goes to the last player who made a capture", () => {
    const s = st({
      deck: [],
      isFinalDeal: true,
      pool: [card("K", "diamonds"), card("K", "clubs")],
      hands: { P0: [card("2", "spades")], P1: [card("3", "spades")] },
      captured: { P0: [card("A", "hearts")], P1: [] },
      lastCapturer: "P0",
    });
    const s1 = apply(s, "P0", moveFor(s, "P0", card("2", "spades"))); // no capture → lays down
    const s2 = apply(s1, "P1", moveFor(s1, "P1", card("3", "spades"))); // no capture → ends round

    expect(s2.phase).toBe("gameOver");
    expect(s2.pool).toHaveLength(0);
    // P0 keeps their ace plus every leftover pool card.
    expect(keys(s2.captured.P0)).toEqual(
      keys([card("A", "hearts"), card("K", "diamonds"), card("K", "clubs"), card("2", "spades"), card("3", "spades")]),
    );
  });
});

// ── Multi-round: accumulate to the target, alternate the starter ─────────────

describe("Pasur — multi-round play", () => {
  /** A round about to end: P0 will scoop a 1-point Ace, P1 scores nothing. */
  const aboutToEnd = (overrides: Partial<PasurState>) =>
    st({
      deck: [],
      isFinalDeal: true,
      pool: [card("K", "diamonds")],
      hands: { P0: [card("2", "spades")], P1: [card("3", "spades")] },
      captured: { P0: [card("A", "hearts")], P1: [] },
      lastCapturer: "P0",
      ...overrides,
    });

  it("folds the round into cumulative scores and deals a new round when the target isn't reached", () => {
    let s = aboutToEnd({ baseScores: { P0: 3, P1: 1 }, targetScore: 100, leaderIndex: 0, roundNumber: 0 });
    s = apply(s, "P0", moveFor(s, "P0", card("2", "spades")));
    s = apply(s, "P1", moveFor(s, "P1", card("3", "spades")));

    expect(s.phase).toBe("playing");
    expect(s.baseScores).toEqual({ P0: 4, P1: 1 }); // P0 +1 (the Ace), P1 +0
    expect(s.roundNumber).toBe(1);
    expect(s.leaderIndex).toBe(1); // starter rotated
    expect(s.currentTurn).toBe("P1");
    // Fresh round: 4 cards each, a 4-card Jack-free pool, 40 left in the deck.
    expect(s.hands.P0).toHaveLength(4);
    expect(s.hands.P1).toHaveLength(4);
    expect(s.pool).toHaveLength(4);
    expect(s.pool.every((c) => c.rank !== "J")).toBe(true);
    expect(s.deck).toHaveLength(40);
    // Per-round state reset.
    expect(s.captured.P0).toHaveLength(0);
    expect(s.surs).toEqual({ P0: 0, P1: 0 });
  });

  it("ends the game when a player reaches the target cumulative score", () => {
    let s = aboutToEnd({ baseScores: { P0: 3, P1: 1 }, targetScore: 4 });
    s = apply(s, "P0", moveFor(s, "P0", card("2", "spades")));
    s = apply(s, "P1", moveFor(s, "P1", card("3", "spades")));

    expect(s.phase).toBe("gameOver");
    expect(s.baseScores.P0).toBe(4);
    expect(pasur.getOutcome(s)!.winners).toEqual(["P0"]);
  });
});

// ── Full end-of-round scoring and winner ─────────────────────────────────────

describe("Pasur — scoring", () => {
  it("tallies card points, clubs majority, and Surs, and picks the winner", () => {
    const s = st({
      captured: {
        // cardPoints: 2 aces + 1 jack + 2♣(2) + 10♦(3) = 8; clubs: 2♣,7♣,9♣ = 3
        P0: [card("A", "hearts"), card("A", "spades"), card("J", "diamonds"), card("2", "clubs"), card("10", "diamonds"), card("7", "clubs"), card("9", "clubs")],
        // cardPoints: 1 ace + 2 jacks = 3; clubs: 3♣,4♣,5♣,6♣ = 4
        P1: [card("A", "diamonds"), card("J", "hearts"), card("J", "spades"), card("3", "clubs"), card("4", "clubs"), card("5", "clubs"), card("6", "clubs")],
      },
    });
    const scores = finalScores(s);
    expect(scores.P0).toBe(8); // no clubs majority
    expect(scores.P1).toBe(10); // 3 card points + 7 clubs majority
  });

  it("a clubs tie awards the 7 to no one", () => {
    const s = st({
      captured: {
        P0: [card("2", "clubs"), card("3", "clubs")], // 2 clubs, cardPoints 2 (2♣)
        P1: [card("4", "clubs"), card("5", "clubs")], // 2 clubs, cardPoints 0
      },
    });
    const t = tally(s);
    expect(t.P0.clubsBonus).toBe(0);
    expect(t.P1.clubsBonus).toBe(0);
  });

  it("getOutcome reports the higher score as winner", () => {
    let s = st({
      deck: [],
      isFinalDeal: true,
      pool: [],
      hands: { P0: [card("K", "spades")], P1: [card("K", "hearts")] },
      captured: {
        P0: [card("A", "hearts"), card("A", "spades")], // 2 points
        P1: [card("2", "clubs")], // 2 points but P1 will also...
      },
      lastCapturer: "P0",
    });
    s = apply(s, "P0", moveFor(s, "P0", card("K", "spades")));
    s = apply(s, "P1", moveFor(s, "P1", card("K", "hearts")));
    expect(s.phase).toBe("gameOver");
    const outcome = pasur.getOutcome(s);
    expect(outcome).not.toBeNull();
    // P0: 2 aces = 2 pts (and scoops the leftover Kings, worth nothing).
    // P1: 2♣ = 2 pts AND the only club on the table → +7 clubs majority = 9.
    expect(outcome!.scores).toMatchObject({ P0: 2, P1: 9 });
    expect(outcome!.winners).toEqual(["P1"]);
  });

  it("an exact tie is a draw (both players win)", () => {
    const s = st({
      phase: "gameOver",
      baseScores: { P0: 5, P1: 5 },
    });
    const outcome = pasur.getOutcome(s);
    expect(outcome!.winners.sort()).toEqual(["P0", "P1"]);
  });
});

// ── Determinism + JSON-safety ────────────────────────────────────────────────

/** Drive a whole game by always taking the first legal move. Deterministic. */
function autoPlay(seed: number, options: Record<string, unknown> = {}): PasurState {
  let s = pasur.setup({ variantId: "pasur-2p", players: [...PLAYERS], options, rng: makeRng(seed) });
  let guard = 0;
  while (s.phase !== "gameOver" && guard++ < 5000) {
    const p = s.currentTurn!;
    const moves = pasur.getValidMoves(s, p);
    const r = pasur.applyMove(s, p, moves[0], makeRng(0));
    if (!r.ok) throw new Error(r.error.message.en);
    s = r.state;
  }
  return s;
}

describe("Pasur — determinism", () => {
  it("same seed + same moves → identical final state", () => {
    expect(JSON.stringify(autoPlay(42))).toBe(JSON.stringify(autoPlay(42)));
  });

  it("state survives JSON round-trips", () => {
    const s = pasur.setup({ variantId: "pasur-2p", players: [...PLAYERS], options: {}, rng: makeRng(3) });
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it("plays a full game to completion using every card", () => {
    const final = autoPlay(99);
    expect(final.phase).toBe("gameOver");
    expect(final.deck).toHaveLength(0);
    expect(final.pool).toHaveLength(0);
    const totalCaptured = final.captured.P0.length + final.captured.P1.length;
    expect(totalCaptured).toBe(52); // every card ends in a pile
  });
});

// ── Bot ──────────────────────────────────────────────────────────────────────

describe("Pasur — bot", () => {
  it("only ever returns moves present in getValidMoves, for a whole game", () => {
    let s = pasur.setup({ variantId: "pasur-2p", players: [...PLAYERS], options: {}, rng: makeRng(5) });
    let guard = 0;
    while (s.phase !== "gameOver" && guard++ < 5000) {
      const p = s.currentTurn!;
      const move = pasurBotMove(s, p);
      const valid = pasur.getValidMoves(s, p);
      expect(valid.some((m) => sameCard(m.card, move.card) && sameCardSet(m.capture, move.capture))).toBe(true);
      const r = pasur.applyMove(s, p, move, makeRng(0));
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error(r.error.message.en);
      s = r.state;
    }
    expect(s.phase).toBe("gameOver");
  });

  it("never reads hidden state: same decision when opponent hand and deck differ", () => {
    const s1 = pasur.setup({ variantId: "pasur-2p", players: [...PLAYERS], options: {}, rng: makeRng(11) });
    const me = s1.currentTurn!;
    const opp = s1.players.find((p) => p !== me)!;
    const m1 = pasurBotMove(s1, me);

    // Scramble exactly the things the bot must not look at.
    const s2: PasurState = {
      ...s1,
      hands: { ...s1.hands, [opp]: [card("Q", "hearts"), card("K", "spades")] },
      deck: [card("A", "clubs"), card("A", "diamonds")],
    };
    const m2 = pasurBotMove(s2, me);

    expect(sameCard(m1.card, m2.card)).toBe(true);
    expect(sameCardSet(m1.capture, m2.capture)).toBe(true);
  });

  it("prefers capturing over laying down", () => {
    const s = st({
      pool: [card("6", "hearts")],
      hands: { P0: [card("5", "spades"), card("K", "clubs")], P1: [card("2", "clubs")] },
    });
    const move = pasurBotMove(s, "P0");
    expect(sameCard(move.card, card("5", "spades"))).toBe(true);
    expect(move.capture.length).toBeGreaterThan(0);
  });
});
