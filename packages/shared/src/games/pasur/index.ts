import type {
  Card,
  GameDefinition,
  GameEvent,
  MoveError,
  MoveResult,
  PlayerId,
  Rng,
} from "../../engine/game-engine";
import type { PasurMove, PasurOptions, PasurState, PasurView } from "./state";
import {
  cardKey,
  createDeck,
  finalScores,
  isSur,
  legalMoves,
  moveEquals,
  roundPoints,
  sameCard,
} from "./rules";
import { pasurBotMove } from "./bot";
import { variant2p } from "./variants/2p";

// ── Module-level helpers ─────────────────────────────────────────────────────

const CARDS_PER_DEAL = 4;
const POOL_SIZE = 4;

function err(code: MoveError["code"], en: string, fa: string): MoveResult<PasurState> {
  return { ok: false, error: { code, message: { en, fa } } };
}

function removeOneCard(hand: Card[], card: Card): Card[] {
  let removed = false;
  return hand.filter((c) => {
    if (!removed && sameCard(c, card)) {
      removed = true;
      return false;
    }
    return true;
  });
}

function resolveOptions(raw: Record<string, unknown>): PasurOptions {
  return {
    surDisabledAt50: (raw.surDisabledAt50 as boolean | undefined) ?? false,
    surTitForTat: (raw.surTitForTat as boolean | undefined) ?? false,
    multiCapture: (raw.multiCapture as boolean | undefined) ?? false,
  };
}

/**
 * Deterministically lay a Jack-free opening pool: deal cards one at a time,
 * setting any Jack aside; once four non-Jacks are face-up, shuffle the buried
 * Jacks back into the remaining deck so they can still come out later. All
 * randomness flows through the injected Rng.
 */
function dealOpeningPool(
  shuffled: Card[],
  rng: { shuffle<T>(items: readonly T[]): T[] },
): { pool: Card[]; deck: Card[] } {
  const working = [...shuffled];
  const pool: Card[] = [];
  const buried: Card[] = [];
  while (pool.length < POOL_SIZE && working.length > 0) {
    const c = working.shift()!;
    if (c.rank === "J") buried.push(c);
    else pool.push(c);
  }
  const deck = buried.length > 0 ? rng.shuffle([...working, ...buried]) : working;
  return { pool, deck };
}

function record0(players: PlayerId[]): Record<PlayerId, number> {
  return Object.fromEntries(players.map((p) => [p, 0]));
}

function blankPiles(players: PlayerId[]): Record<PlayerId, Card[]> {
  return Object.fromEntries(players.map((p) => [p, []]));
}

/**
 * Deal a fresh round from a newly shuffled 52-card deck: a Jack-free opening
 * pool, then 4 cards to each player. Used for the opening round and every
 * subsequent round of a multi-round game.
 */
function dealRound(players: PlayerId[], rng: Rng): {
  pool: Card[];
  deck: Card[];
  hands: Record<PlayerId, Card[]>;
} {
  const shuffled = rng.shuffle(createDeck());
  const { pool, deck: afterPool } = dealOpeningPool(shuffled, rng);
  const deck = [...afterPool];
  const hands: Record<PlayerId, Card[]> = {};
  for (const p of players) hands[p] = deck.splice(0, CARDS_PER_DEAL);
  return { pool, deck, hands };
}

// ── apply ────────────────────────────────────────────────────────────────────

function applyPlay(state: PasurState, player: PlayerId, move: PasurMove, rng: Rng): MoveResult<PasurState> {
  const { players } = state;
  const idx = players.indexOf(player);
  const newHands = { ...state.hands, [player]: removeOneCard(state.hands[player] ?? [], move.card) };
  const newCaptured = { ...state.captured };
  const newSurs = { ...state.surs };
  let lastCapturer = state.lastCapturer;
  const events: GameEvent[] = [];

  const didCapture = move.capture.length > 0;
  let newPool: Card[];

  if (didCapture) {
    const capKeys = new Set(move.capture.map(cardKey));
    newPool = state.pool.filter((c) => !capKeys.has(cardKey(c)));
    newCaptured[player] = [...(state.captured[player] ?? []), move.card, ...move.capture];
    lastCapturer = player;
    const clears = newPool.length === 0;
    const sur = isSur(move.card, clears, state.isFinalDeal);
    if (sur) newSurs[player] = (newSurs[player] ?? 0) + 1;

    events.push({
      type: "cardPlayed",
      data: { playerId: player, card: move.card, captured: move.capture, cleared: clears },
      visibility: { kind: "public" },
    });
    if (sur) {
      events.push({ type: "sur", data: { playerId: player }, visibility: { kind: "public" } });
    }
  } else {
    newPool = [...state.pool, move.card];
    events.push({
      type: "cardPlayed",
      data: { playerId: player, card: move.card, captured: [] },
      visibility: { kind: "public" },
    });
  }

  const allEmpty = players.every((p) => (newHands[p] ?? []).length === 0);

  // Hand still in progress — pass the turn.
  if (!allEmpty) {
    return {
      ok: true,
      state: {
        ...state,
        hands: newHands,
        pool: newPool,
        captured: newCaptured,
        surs: newSurs,
        lastCapturer,
        currentTurn: players[(idx + 1) % players.length],
      },
      events,
    };
  }

  // Everyone is out of cards. Deal again if the deck still has cards.
  if (state.deck.length > 0) {
    const deck = [...state.deck];
    const dealtHands = { ...newHands };
    for (const p of players) dealtHands[p] = deck.splice(0, CARDS_PER_DEAL);
    const isFinalDeal = state.isFinalDeal || deck.length === 0;
    events.push({ type: "dealt", data: { isFinalDeal }, visibility: { kind: "public" } });
    return {
      ok: true,
      state: {
        ...state,
        hands: dealtHands,
        pool: newPool,
        deck,
        captured: newCaptured,
        surs: newSurs,
        lastCapturer,
        isFinalDeal,
        currentTurn: players[state.leaderIndex],
      },
      events,
    };
  }

  // Deck exhausted and all hands empty — end of round: leftover pool goes to the
  // last player who made a capture, then tally this round's points.
  const finalCaptured = { ...newCaptured };
  if (lastCapturer && newPool.length > 0) {
    finalCaptured[lastCapturer] = [...(finalCaptured[lastCapturer] ?? []), ...newPool];
    events.push({
      type: "poolToLastCapturer",
      data: { playerId: lastCapturer, cards: newPool },
      visibility: { kind: "public" },
    });
  }

  const roundEnd: PasurState = {
    ...state,
    hands: newHands,
    pool: [],
    deck: [],
    captured: finalCaptured,
    surs: newSurs,
    lastCapturer,
  };
  const thisRound = roundPoints(roundEnd);            // points won this round
  const newScores = finalScores(roundEnd);            // cumulative after this round

  // Game over: someone reached the target cumulative score.
  if (state.players.some((p) => newScores[p] >= state.targetScore)) {
    events.push({
      type: "gameOver",
      data: { scores: newScores, roundPoints: thisRound },
      visibility: { kind: "public" },
    });
    return {
      ok: true,
      state: { ...roundEnd, baseScores: newScores, phase: "gameOver", currentTurn: null },
      events,
    };
  }

  // Otherwise deal the next round. The starter (round leader) rotates each round.
  const nextLeader = (state.leaderIndex + 1) % state.players.length;
  const { pool, deck, hands } = dealRound(state.players, rng);
  events.push({
    type: "roundOver",
    data: { roundNumber: state.roundNumber, scores: newScores, roundPoints: thisRound },
    visibility: { kind: "public" },
  });
  return {
    ok: true,
    state: {
      ...roundEnd,
      baseScores: newScores,
      captured: blankPiles(state.players),
      surs: record0(state.players),
      pool,
      deck,
      hands,
      lastCapturer: null,
      isFinalDeal: deck.length === 0,
      leaderIndex: nextLeader,
      currentTurn: state.players[nextLeader],
      roundNumber: state.roundNumber + 1,
    },
    events,
  };
}

// ── GameDefinition ───────────────────────────────────────────────────────────

export const pasur: GameDefinition<PasurState, PasurMove, PasurView> = {
  id: "pasur",
  name: { en: "Pasur", fa: "پاسور" },
  variants: [variant2p],

  setup(ctx) {
    const { players, rng } = ctx;
    const options = resolveOptions(ctx.options);
    const targetScore = (ctx.options.targetScore as number | undefined) ?? 62;
    const { pool, deck, hands } = dealRound(players, rng);

    return {
      phase: "playing",
      players,
      hands,
      pool,
      captured: blankPiles(players),
      surs: record0(players),
      deck,
      currentTurn: players[0],
      leaderIndex: 0,
      lastCapturer: null,
      isFinalDeal: deck.length === 0,
      options,
      baseScores: record0(players),
      targetScore,
      roundNumber: 0,
    };
  },

  getValidMoves(state, player) {
    return legalMoves(state, player);
  },

  applyMove(state, player, move, rng) {
    if (state.phase === "gameOver")
      return err("WRONG_PHASE", "The game is over.", "بازی تمام شده است.");
    if (state.currentTurn !== player)
      return err("NOT_YOUR_TURN", "It is not your turn.", "نوبت شما نیست.");
    if (move.type !== "play")
      return err("INVALID_MOVE", "That move is not legal right now.", "این حرکت مجاز نیست.");

    const inHand = (state.hands[player] ?? []).some((c) => sameCard(c, move.card));
    if (!inHand)
      return err("INVALID_MOVE", "That card is not in your hand.", "این کارت در دست شما نیست.");

    const valid = legalMoves(state, player);
    if (!valid.some((m) => moveEquals(m, move)))
      return err(
        "RULE_VIOLATION",
        "That capture is not legal — pick a valid combination.",
        "این برداشت مجاز نیست — یک ترکیب درست انتخاب کنید.",
      );

    return applyPlay(state, player, move, rng);
  },

  getPlayerView(state, player): PasurView {
    return {
      forPlayer: player,
      phase: state.phase,
      currentTurn: state.currentTurn,
      players: state.players,
      hand: state.hands[player] ?? [],
      handSizes: state.players.map((p) => (state.hands[p] ?? []).length),
      pool: state.pool,
      capturedCounts: state.players.map((p) => (state.captured[p] ?? []).length),
      surs: state.players.map((p) => state.surs[p] ?? 0),
      lastCapturer: state.lastCapturer,
      deckCount: state.deck.length,
      isFinalDeal: state.isFinalDeal,
      options: state.options,
      scores: state.players.map((p) => state.baseScores[p] ?? 0),
      targetScore: state.targetScore,
      roundNumber: state.roundNumber,
    };
  },

  getOutcome(state) {
    if (state.phase !== "gameOver") return null;
    const scores = state.baseScores;
    const max = Math.max(...state.players.map((p) => scores[p] ?? 0));
    return {
      winners: state.players.filter((p) => (scores[p] ?? 0) === max),
      scores: Object.fromEntries(state.players.map((p) => [p, scores[p] ?? 0])),
    };
  },

  getDefaultMove(state, player) {
    const moves = legalMoves(state, player);
    // Prefer a capture (most cards taken); otherwise lay the lowest card down.
    const captures = moves.filter((m) => m.capture.length > 0);
    if (captures.length > 0) {
      return captures.reduce((best, m) => (m.capture.length > best.capture.length ? m : best));
    }
    return moves[0];
  },

  getBotMove(state, player) {
    return pasurBotMove(state, player);
  },
};
