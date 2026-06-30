import { describe, expect, it } from "vitest";
import type { Card, Rank, Suit } from "../../engine/game-engine";
import { makeRng } from "../../engine/rng";
import { shelem } from "./index";
import type { ShelemMove, ShelemOptions, ShelemState } from "./state";
import {
  cardPointsOf,
  createDeck,
  isLegalPlay,
  moveEquals,
  roundTotalPoints,
  scoreRound,
  trickWinner,
} from "./rules";

// ── Helpers ──────────────────────────────────────────────────────────────────

const PLAYERS = ["P0", "P1", "P2", "P3"] as const;
const ALL_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

const DEFAULT_OPTIONS: ShelemOptions = {
  failPenalty: "simple",
  zaminReveal: "private",
  shelemReward: "330",
  aceValue: 10,
  successScore: "bidExact",
};

function setup(seed: number, options: Record<string, unknown> = {}): ShelemState {
  return shelem.setup({ variantId: "shelem-4p", players: [...PLAYERS], options, rng: makeRng(seed) });
}

/** Apply a move, assert success, return the new state. */
function play(state: ShelemState, player: string, move: ShelemMove, seed = 0): ShelemState {
  const r = shelem.applyMove(state, player, move, makeRng(seed));
  expect(r.ok, r.ok ? "" : r.error.message.en).toBe(true);
  if (!r.ok) throw new Error(r.error.message.en);
  return r.state;
}

/** Drive a full game with the bot brain to completion (or a move cap). */
function autoPlay(seed: number, options: Record<string, unknown> = {}, maxMoves = 4000) {
  const rng = makeRng(seed);
  let state = shelem.setup({ variantId: "shelem-4p", players: [...PLAYERS], options, rng });
  const events: { type: string; data?: unknown }[] = [];
  let moves = 0;
  while (state.phase !== "gameOver" && moves < maxMoves) {
    const p = state.currentTurn;
    if (!p) break;
    const move = shelem.getBotMove!(state, p, rng);
    const r = shelem.applyMove(state, p, move, rng);
    if (!r.ok) throw new Error(`${p} (${state.phase}): ${r.error.message.en} :: ${JSON.stringify(move)}`);
    state = r.state;
    for (const e of r.events) events.push({ type: e.type, data: e.data });
    moves++;
  }
  return { state, events, moves };
}

/** Resolve the auction so P0 wins a numeric contract; returns zaminExchange state. */
function biddingToHakem(seed: number, bid = 50, options: Record<string, unknown> = {}): ShelemState {
  let s = setup(seed, options);
  // setup makes dealer = seat 3, so P0 bids first.
  s = play(s, "P0", { type: "bid", amount: bid });
  s = play(s, "P1", { type: "pass" });
  s = play(s, "P2", { type: "pass" });
  s = play(s, "P3", { type: "pass" });
  return s;
}

/** Drive bidding → bury 4 → name trump; returns a fresh "playing" state (P0 = Hakem). */
function toPlaying(seed: number, bid = 50, trump: Suit = "spades", options: Record<string, unknown> = {}): ShelemState {
  let s = biddingToHakem(seed, bid, options);
  s = play(s, "P0", { type: "discard", cards: [...s.hands.P0, ...s.zamin].slice(0, 4) });
  s = play(s, "P0", { type: "chooseTrump", suit: trump });
  return s;
}

function fives(n: number): Card[] {
  return Array.from({ length: n }, () => card("5", "clubs"));
}

/** A minimal round-end state for testing scoreRound directly (P0 = Hakem, team 0). */
function scoringState(overrides: Partial<ShelemState> = {}): ShelemState {
  return {
    phase: "playing",
    players: [...PLAYERS],
    dealerIndex: 3,
    teamMap: { P0: 0, P1: 1, P2: 0, P3: 1 },
    currentBidder: null,
    highBid: 50,
    highBidder: 0,
    isShelemBid: false,
    passed: [false, false, false, false],
    hakemIndex: 0,
    contractBid: 50,
    contractIsShelem: false,
    hands: { P0: [], P1: [], P2: [], P3: [] },
    zamin: [],
    trumpSuit: "spades",
    currentTrick: [],
    trickLeaderIndex: 0,
    currentTurn: "P0",
    capturedTeam: [[], []],
    zaminPile: [],
    tricksWonTeam: [0, 0],
    scores: [0, 0],
    roundNumber: 0,
    targetScore: 1165,
    options: { ...DEFAULT_OPTIONS },
    ...overrides,
  };
}

function playingState(hands: Record<string, Card[]>, overrides: Partial<ShelemState> = {}): ShelemState {
  return scoringState({ hands, ...overrides });
}

// ── setup ──────────────────────────────────────────────────────────────────

describe("setup", () => {
  it("starts in bidding with 12 cards each and a 4-card Zamin", () => {
    const s = setup(1);
    expect(s.phase).toBe("bidding");
    for (const p of s.players) expect(s.hands[p]).toHaveLength(12);
    expect(s.zamin).toHaveLength(4);
  });

  it("deals all 52 cards exactly once (hands + Zamin)", () => {
    const s = setup(2);
    const all: Card[] = [...s.zamin];
    for (const p of s.players) all.push(...s.hands[p]);
    expect(all).toHaveLength(52);
    expect(new Set(all.map(c => `${c.rank}${c.suit}`)).size).toBe(52);
  });

  it("first bidder sits to the left of the dealer", () => {
    const s = setup(3);
    expect(s.dealerIndex).toBe(3);
    expect(s.currentBidder).toBe(0);
    expect(s.currentTurn).toBe("P0");
  });

  it("is deterministic for a fixed seed", () => {
    expect(setup(99)).toEqual(setup(99));
  });

  it("respects the targetScore and aceValue options", () => {
    const s = setup(4, { targetScore: 600, aceValue: 15 });
    expect(s.targetScore).toBe(600);
    expect(s.options.aceValue).toBe(15);
  });
});

// ── bidding ──────────────────────────────────────────────────────────────────

describe("bidding", () => {
  it("offers pass, the 5-step ladder from 5, and Shelem to the active bidder only", () => {
    const s = setup(10);
    const moves = shelem.getValidMoves(s, "P0");
    expect(moves.some(m => m.type === "pass")).toBe(true);
    expect(moves.some(m => m.type === "bid" && m.amount === 5)).toBe(true);
    expect(moves.some(m => m.type === "bidShelem")).toBe(true);
    // The numeric ladder stops one step below the round total (165): 160 is the top.
    expect(moves.some(m => m.type === "bid" && m.amount === 160)).toBe(true);
    expect(moves.some(m => m.type === "bid" && m.amount === 165)).toBe(false);
    // Nobody else may act.
    expect(shelem.getValidMoves(s, "P1")).toHaveLength(0);
  });

  it("requires a strictly higher multiple of 5", () => {
    let s = setup(11);
    s = play(s, "P0", { type: "bid", amount: 25 });
    expect(s.highBid).toBe(25);
    expect(s.currentBidder).toBe(1);
    // equal / lower / non-multiple are all illegal
    expect(shelem.applyMove(s, "P1", { type: "bid", amount: 25 }, makeRng(0)).ok).toBe(false);
    expect(shelem.applyMove(s, "P1", { type: "bid", amount: 20 }, makeRng(0)).ok).toBe(false);
    expect(shelem.applyMove(s, "P1", { type: "bid", amount: 27 }, makeRng(0)).ok).toBe(false);
    expect(shelem.applyMove(s, "P1", { type: "bid", amount: 30 }, makeRng(0)).ok).toBe(true);
  });

  it("has no minimum floor — the opening bid may be 5", () => {
    let s = setup(12);
    s = play(s, "P0", { type: "bid", amount: 5 });
    expect(s.highBid).toBe(5);
  });

  it("a pass is permanent — a passed seat never gets the clock back", () => {
    let s = setup(13);
    s = play(s, "P0", { type: "bid", amount: 30 });
    s = play(s, "P1", { type: "pass" });
    expect(s.passed[1]).toBe(true);
    s = play(s, "P2", { type: "bid", amount: 35 });
    // After P2's raise the clock goes to P3, never back to the passed P1.
    expect(s.currentBidder).toBe(3);
    s = play(s, "P3", { type: "pass" });
    // Only P0 and P2 remain; P2 holds high → P0 must act, not P1.
    expect(s.currentBidder).toBe(0);
    expect(shelem.getValidMoves(s, "P1")).toHaveLength(0);
  });

  it("resolves to the highest bidder as Hakem and moves to the Zamin exchange", () => {
    const s = biddingToHakem(14, 75);
    expect(s.phase).toBe("zaminExchange");
    expect(s.hakemIndex).toBe(0);
    expect(s.contractBid).toBe(75);
    expect(s.contractIsShelem).toBe(false);
    expect(s.currentTurn).toBe("P0");
  });

  it("Shelem outranks every numeric bid; once called only Pass remains", () => {
    let s = setup(15);
    s = play(s, "P0", { type: "bid", amount: 100 });
    s = play(s, "P1", { type: "bidShelem" });
    expect(s.isShelemBid).toBe(true);
    expect(s.highBidder).toBe(1);
    const moves = shelem.getValidMoves(s, "P2");
    expect(moves).toHaveLength(1);
    expect(moves[0].type).toBe("pass");
    // Can't call Shelem twice.
    expect(shelem.applyMove(s, "P2", { type: "bidShelem" }, makeRng(0)).ok).toBe(false);
  });

  it("a resolved Shelem contract is the full round total", () => {
    let s = setup(16);
    s = play(s, "P0", { type: "bidShelem" });
    s = play(s, "P1", { type: "pass" });
    s = play(s, "P2", { type: "pass" });
    s = play(s, "P3", { type: "pass" });
    expect(s.phase).toBe("zaminExchange");
    expect(s.contractIsShelem).toBe(true);
    expect(s.contractBid).toBe(165);
  });

  it("an all-pass auction re-deals and rotates the dealer", () => {
    let s = setup(17);
    const firstHands = s.hands.P0;
    s = play(s, "P0", { type: "pass" });
    s = play(s, "P1", { type: "pass" });
    s = play(s, "P2", { type: "pass" });
    s = play(s, "P3", { type: "pass" });
    expect(s.phase).toBe("bidding");
    expect(s.dealerIndex).toBe(0); // rotated from 3
    expect(s.currentBidder).toBe(1); // left of the new dealer
    expect(s.highBidder).toBeNull();
    expect(s.passed).toEqual([false, false, false, false]);
    // A fresh deal: hands differ.
    expect(s.hands.P0).not.toEqual(firstHands);
  });
});

// ── Zamin exchange ───────────────────────────────────────────────────────────

describe("Zamin exchange", () => {
  it("the Hakem holds 16 and buries exactly 4, returning to 12", () => {
    let s = biddingToHakem(20, 60);
    const holding = [...s.hands.P0, ...s.zamin];
    expect(holding).toHaveLength(16);
    const discard = holding.slice(0, 4);
    s = play(s, "P0", { type: "discard", cards: discard });
    // After burying, the Hakem names trump (حکم) before play begins.
    expect(s.phase).toBe("chooseTrump");
    expect(s.hands.P0).toHaveLength(12);
    expect(s.zaminPile).toHaveLength(4);
    expect(s.zamin).toHaveLength(0);
    expect(s.trumpSuit).toBeNull();
    expect(s.currentTurn).toBe("P0");
  });

  it("getValidMoves enumerates every 4-card discard and applyMove agrees", () => {
    const s = biddingToHakem(21, 50);
    const moves = shelem.getValidMoves(s, "P0");
    // C(16,4) = 1820 distinct discards.
    expect(moves).toHaveLength(1820);
    expect(moves.every(m => m.type === "discard" && m.cards.length === 4)).toBe(true);
    // Every enumerated move is accepted by applyMove (they never disagree).
    for (const m of [moves[0], moves[900], moves[moves.length - 1]]) {
      expect(shelem.applyMove(s, "P0", m, makeRng(0)).ok).toBe(true);
    }
  });

  it("rejects illegal discards (wrong count, or a card not held)", () => {
    const s = biddingToHakem(22, 50);
    const holding = [...s.hands.P0, ...s.zamin];
    expect(shelem.applyMove(s, "P0", { type: "discard", cards: holding.slice(0, 3) }, makeRng(0)).ok).toBe(false);
    // A card the Hakem does not hold.
    const notHeld = createDeck().find(c => !holding.some(h => h.rank === c.rank && h.suit === c.suit))!;
    const bogus = [notHeld, ...holding.slice(0, 3)];
    expect(shelem.applyMove(s, "P0", { type: "discard", cards: bogus }, makeRng(0)).ok).toBe(false);
  });

  it("private (default): only the Hakem sees the Zamin during the exchange", () => {
    const s = biddingToHakem(23, 50);
    expect(shelem.getPlayerView(s, "P0").zamin).toHaveLength(4); // Hakem
    expect(shelem.getPlayerView(s, "P1").zamin).toHaveLength(0); // opponent
    expect(shelem.getPlayerView(s, "P0").hand).toHaveLength(16); // holds the 16
  });

  it("reveal: the Zamin is face-up to everyone during bidding and exchange", () => {
    const sBid = setup(24, { zaminReveal: "reveal" });
    expect(shelem.getPlayerView(sBid, "P2").zamin).toHaveLength(4);
    const sEx = biddingToHakem(24, 50, { zaminReveal: "reveal" });
    expect(shelem.getPlayerView(sEx, "P1").zamin).toHaveLength(4);
  });
});

// ── trick play ────────────────────────────────────────────────────────────────

describe("trick play", () => {
  it("the Hakem names trump (حکم) after the Zamin exchange, then leads", () => {
    let s = biddingToHakem(70, 55);
    s = play(s, "P0", { type: "discard", cards: [...s.hands.P0, ...s.zamin].slice(0, 4) });
    expect(s.phase).toBe("chooseTrump");
    // Only the Hakem may choose, and any of the 4 suits is offered.
    expect(shelem.getValidMoves(s, "P0")).toHaveLength(4);
    expect(shelem.getValidMoves(s, "P1")).toHaveLength(0);
    const r = shelem.applyMove(s, "P0", { type: "chooseTrump", suit: "clubs" }, makeRng(0));
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(r.state.phase).toBe("playing");
    expect(r.state.trumpSuit).toBe("clubs");
    expect(r.state.currentTurn).toBe("P0"); // Hakem leads the first trick
    expect(r.events.some(e => e.type === "trumpSet")).toBe(true);
  });

  it("enforces follow-suit via applyMove", () => {
    const s = playingState(
      { P0: [card("K", "hearts"), card("2", "spades")], P1: [], P2: [], P3: [] },
      { currentTrick: [{ playerId: "P1", card: card("3", "hearts") }], currentTurn: "P0", trickLeaderIndex: 1 },
    );
    const bad = shelem.applyMove(s, "P0", { type: "playCard", card: card("2", "spades") }, makeRng(0));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe("RULE_VIOLATION");
    expect(shelem.applyMove(s, "P0", { type: "playCard", card: card("K", "hearts") }, makeRng(0)).ok).toBe(true);
  });

  it("trump beats the highest card of the led suit", () => {
    const trick = [
      { playerId: "P0", card: card("A", "hearts") },
      { playerId: "P1", card: card("2", "spades") }, // trump
      { playerId: "P2", card: card("K", "hearts") },
      { playerId: "P3", card: card("Q", "hearts") },
    ];
    expect(trickWinner(trick, "spades")).toBe("P1");
  });

  it("getValidMoves and applyMove never disagree when following", () => {
    const s = playingState(
      { P0: [card("5", "hearts"), card("9", "hearts"), card("2", "spades")], P1: [], P2: [], P3: [] },
      { currentTrick: [{ playerId: "P3", card: card("3", "hearts") }], currentTurn: "P0", trickLeaderIndex: 3 },
    );
    const legal = shelem.getValidMoves(s, "P0");
    // Holding hearts → only the two hearts are legal, never the spade.
    expect(legal).toHaveLength(2);
    expect(legal.every(m => m.type === "playCard" && m.card.suit === "hearts")).toBe(true);
    expect(isLegalPlay(s.hands.P0, card("2", "spades"), s.currentTrick)).toBe(false);
  });

  it("completes a trick, credits the winning team, and leads from the winner", () => {
    let s = playingState({
      P0: [card("A", "spades"), card("2", "hearts")],
      P1: [card("K", "spades"), card("3", "hearts")],
      P2: [card("Q", "spades"), card("4", "hearts")],
      P3: [card("J", "spades"), card("5", "hearts")],
    }, { trumpSuit: "hearts" });
    s = play(s, "P0", { type: "playCard", card: card("A", "spades") });
    s = play(s, "P1", { type: "playCard", card: card("K", "spades") });
    s = play(s, "P2", { type: "playCard", card: card("Q", "spades") });
    s = play(s, "P3", { type: "playCard", card: card("J", "spades") });
    // P0 wins with A♠ (no trump played) → team 0 credited, P0 leads next.
    expect(s.tricksWonTeam[0]).toBe(1);
    expect(s.capturedTeam[0]).toHaveLength(4);
    expect(s.currentTurn).toBe("P0");
    expect(s.currentTrick).toHaveLength(0);
  });
});

// ── scoring ──────────────────────────────────────────────────────────────────

describe("scoring — round total invariant", () => {
  it("captured + Zamin always tallies to 165 across both teams (aceValue 10)", () => {
    const deck = createDeck();
    const s = scoringState({
      capturedTeam: [deck.slice(0, 24), deck.slice(24, 48)],
      zaminPile: deck.slice(48, 52),
      tricksWonTeam: [6, 6], // 12 played tricks
    });
    const sc = scoreRound(s);
    expect(sc.made[0] + sc.made[1]).toBe(165);
  });

  it("flips to 185 when aceValue is 15", () => {
    const deck = createDeck();
    const s = scoringState({
      capturedTeam: [deck.slice(0, 24), deck.slice(24, 48)],
      zaminPile: deck.slice(48, 52),
      tricksWonTeam: [7, 5],
      options: { ...DEFAULT_OPTIONS, aceValue: 15 },
    });
    expect(roundTotalPoints(15)).toBe(185);
    const sc = scoreRound(s);
    expect(sc.made[0] + sc.made[1]).toBe(185);
  });

  it("every full round played out tallies to exactly the round total", () => {
    const { events } = autoPlay(7, { targetScore: 200 });
    const rounds = events.filter(e => e.type === "roundOver");
    expect(rounds.length).toBeGreaterThan(0);
    for (const r of rounds) {
      const made = (r.data as { made: number[] }).made;
      expect(made[0] + made[1]).toBe(165);
    }
  });
});

describe("scoring — Hakem contract outcomes", () => {
  it("bidExact success: the Hakem team scores exactly the bid; opponents score what they made", () => {
    // Hakem team (0) makes plenty; bid 50.
    const s = scoringState({ contractBid: 50, capturedTeam: [fives(20), fives(5)], tricksWonTeam: [0, 0] });
    const sc = scoreRound(s);
    expect(sc.contractMade).toBe(true);
    expect(sc.delta[0]).toBe(50); // bidExact cap
    expect(sc.delta[1]).toBe(sc.made[1]); // opponents always score their made
  });

  it("actual success: the Hakem team scores the full points it made (uncapped)", () => {
    const s = scoringState({
      contractBid: 50,
      capturedTeam: [fives(20), fives(5)],
      options: { ...DEFAULT_OPTIONS, successScore: "actual" },
    });
    const sc = scoreRound(s);
    expect(sc.delta[0]).toBe(sc.made[0]);
    expect(sc.made[0]).toBeGreaterThan(50);
  });

  it("simple failure: lose exactly the bid", () => {
    const s = scoringState({ contractBid: 80, capturedTeam: [fives(3), fives(20)], tricksWonTeam: [0, 0] });
    const sc = scoreRound(s);
    expect(sc.contractMade).toBe(false);
    expect(sc.delta[0]).toBe(-80);
  });

  it("doubled failure: lose double the bid only when the Hakem team trailed the opponents", () => {
    // Under the opponents → doubled.
    const under = scoreRound(scoringState({
      contractBid: 80, capturedTeam: [fives(2), fives(24)], tricksWonTeam: [0, 0],
      options: { ...DEFAULT_OPTIONS, failPenalty: "doubled" },
    }));
    expect(under.made[0]).toBeLessThan(under.made[1]);
    expect(under.delta[0]).toBe(-160);
    // Failed but still ahead of the opponents → single.
    const ahead = scoreRound(scoringState({
      contractBid: 100, capturedTeam: [fives(14), fives(10)], tricksWonTeam: [0, 0],
      options: { ...DEFAULT_OPTIONS, failPenalty: "doubled" },
    }));
    expect(ahead.made[0]).toBeGreaterThan(ahead.made[1]);
    expect(ahead.delta[0]).toBe(-100);
  });

  it("yasa failure: the full round total as negative when the Hakem team trailed", () => {
    const under = scoreRound(scoringState({
      contractBid: 80, capturedTeam: [fives(2), fives(24)], tricksWonTeam: [0, 0],
      options: { ...DEFAULT_OPTIONS, failPenalty: "yasa" },
    }));
    expect(under.delta[0]).toBe(-165);
    // Failed but ahead → just the bid.
    const ahead = scoreRound(scoringState({
      contractBid: 100, capturedTeam: [fives(14), fives(10)], tricksWonTeam: [0, 0],
      options: { ...DEFAULT_OPTIONS, failPenalty: "yasa" },
    }));
    expect(ahead.delta[0]).toBe(-100);
  });
});

describe("scoring — Shelem (slam)", () => {
  it("a successful slam (opponents took no trick) scores the flat 330 reward", () => {
    const s = scoringState({
      contractIsShelem: true, contractBid: 165,
      capturedTeam: [fives(20), []], tricksWonTeam: [12, 0],
      options: { ...DEFAULT_OPTIONS, shelemReward: "330" },
    });
    const sc = scoreRound(s);
    expect(sc.contractMade).toBe(true);
    expect(sc.delta[0]).toBe(330);
  });

  it("bidX2 reward doubles the slam's effective bid (the round total)", () => {
    const s = scoringState({
      contractIsShelem: true, contractBid: 165,
      capturedTeam: [fives(20), []], tricksWonTeam: [12, 0],
      options: { ...DEFAULT_OPTIONS, shelemReward: "bidX2" },
    });
    expect(scoreRound(s).delta[0]).toBe(330);
  });

  it("a failed slam (opponents stole a trick) pays the failure penalty against the total", () => {
    const s = scoringState({
      contractIsShelem: true, contractBid: 165,
      capturedTeam: [fives(18), fives(2)], tricksWonTeam: [11, 1],
      options: { ...DEFAULT_OPTIONS, failPenalty: "simple" },
    });
    const sc = scoreRound(s);
    expect(sc.contractMade).toBe(false);
    expect(sc.delta[0]).toBe(-165);
  });
});

// ── outcome, determinism, redaction ───────────────────────────────────────────

describe("game completion", () => {
  it("a full game reaches gameOver with a 2-player winning team and team scores", () => {
    const { state } = autoPlay(31, { targetScore: 165 });
    expect(state.phase).toBe("gameOver");
    const outcome = shelem.getOutcome(state);
    expect(outcome).not.toBeNull();
    expect(outcome!.winners).toHaveLength(2);
    expect(Object.keys(outcome!.scores)).toEqual(["team0", "team1"]);
  });

  it("getOutcome is null while the game is running", () => {
    expect(shelem.getOutcome(setup(32))).toBeNull();
  });
});

describe("determinism", () => {
  it("same seed + bot brain produces an identical final state", () => {
    const a = autoPlay(123, { targetScore: 330 });
    const b = autoPlay(123, { targetScore: 330 });
    expect(a.state).toEqual(b.state);
    expect(a.moves).toBe(b.moves);
  });
});

describe("getPlayerView — redaction (security)", () => {
  it("a view never exposes another seat's hand, the buried Zamin, or full state", () => {
    let s = biddingToHakem(40, 55);
    s = play(s, "P0", { type: "discard", cards: [...s.hands.P0, ...s.zamin].slice(0, 4) });
    s = play(s, "P0", { type: "chooseTrump", suit: "spades" });
    // mid-play
    s = play(s, "P0", { type: "playCard", card: shelem.getValidMoves(s, "P0")[0].type === "playCard" ? (shelem.getValidMoves(s, "P0")[0] as { card: Card }).card : s.hands.P0[0] });
    for (const p of s.players) {
      const view = shelem.getPlayerView(s, p);
      const keys = Object.keys(view);
      expect(keys).not.toContain("hands");
      expect(keys).not.toContain("zaminPile");
      expect(keys).not.toContain("deck");
      // Own hand only.
      if (p !== s.currentTurn || s.phase === "playing") {
        expect(view.hand).toEqual(s.hands[p]);
      }
      // The buried Zamin is never visible to anyone during play.
      expect(view.zamin).toHaveLength(0);
      // handSizes reveals counts, not cards.
      expect(view.handSizes).toHaveLength(4);
    }
  });

  it("the round total stays whole when aceValue is 15 through a full game", () => {
    const { events } = autoPlay(8, { targetScore: 200, aceValue: 15 });
    const rounds = events.filter(e => e.type === "roundOver");
    expect(rounds.length).toBeGreaterThan(0);
    for (const r of rounds) {
      const made = (r.data as { made: number[] }).made;
      expect(made[0] + made[1]).toBe(185);
    }
  });
});

// ── moveEquals sanity (engine internals used by applyMove) ─────────────────────

describe("moveEquals", () => {
  it("matches discards regardless of card order", () => {
    const a: ShelemMove = { type: "discard", cards: [card("A", "spades"), card("2", "hearts")] };
    const b: ShelemMove = { type: "discard", cards: [card("2", "hearts"), card("A", "spades")] };
    expect(moveEquals(a, b)).toBe(true);
  });
});
