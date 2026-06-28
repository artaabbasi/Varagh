import type { Card, PlayerId, Rank, Suit } from "../../engine/game-engine";
import type { PasurMove, PasurOptions, PasurState } from "./state";

export const SUITS: readonly Suit[] = ["hearts", "diamonds", "clubs", "spades"];
export const RANKS: readonly Rank[] = [
  "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A",
];

/** Numeral capture values: A counts as 1, 2–10 face value, J/Q/K are NOT numerals. */
const NUMERAL_VALUE: Partial<Record<Rank, number>> = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10,
};

export function numeralValue(card: Card): number | null {
  return NUMERAL_VALUE[card.rank] ?? null;
}

export function isNumeral(card: Card): boolean {
  return numeralValue(card) !== null;
}

/** Stable identity for a card within a 52-card deck (no duplicates exist). */
export function cardKey(c: Card): string {
  return `${c.rank}-${c.suit}`;
}

export function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ suit, rank });
  }
  return deck;
}

/** Total points up for grabs each game — used by the bot/UI, not by scoring. */
export const POOL_SUR_POINTS = 5;
export const CLUBS_MAJORITY_POINTS = 7;

// ── Capture enumeration ──────────────────────────────────────────────────────

/**
 * Every distinct subset of the pool's numerals whose values sum to `target`.
 * Each entry is a concrete set of cards — two pool 5s yield two distinct
 * singletons, because the player must be able to choose which physical card
 * to take.
 */
function subsetsSummingTo(items: { card: Card; value: number }[], target: number): Card[][] {
  const out: Card[][] = [];
  const acc: Card[] = [];
  const dfs = (i: number, remaining: number): void => {
    if (remaining === 0) {
      out.push([...acc]);
      return;
    }
    if (i >= items.length || remaining < 0) return;
    acc.push(items[i].card);
    dfs(i + 1, remaining - items[i].value);
    acc.pop();
    dfs(i + 1, remaining);
  };
  dfs(0, target);
  return out;
}

/**
 * All legal moves for playing `card` against `pool`. The card is NOT yet in the
 * pool. Capturing is mandatory when possible: a card that can capture has only
 * capture moves (never a lay-down option); a card that cannot capture has the
 * single lay-it-in-the-pool move (empty capture).
 *
 *  - Numeral: captures pool numerals summing with it to exactly 11. Each
 *    distinct combination is its own move, unless `multiCapture` is on, in which
 *    case a single move takes the union of every combination.
 *  - Jack: captures every pool numeral and Jack (never Q/K) in one move.
 *  - Queen/King: captures matching-rank court cards in the pool, in one move.
 */
export function captureOptionsFor(card: Card, pool: Card[], options: PasurOptions): Card[][] {
  if (card.rank === "J") {
    const taken = pool.filter((p) => isNumeral(p) || p.rank === "J");
    return [taken]; // possibly empty → lays the Jack in the pool
  }
  if (card.rank === "Q" || card.rank === "K") {
    const taken = pool.filter((p) => p.rank === card.rank);
    return [taken]; // matching court cards, or empty → lays it in the pool
  }

  // Numeral
  const value = numeralValue(card)!;
  const numerals = pool
    .filter(isNumeral)
    .map((c) => ({ card: c, value: numeralValue(c)! }));
  const subsets = subsetsSummingTo(numerals, 11 - value);

  if (subsets.length === 0) return [[]]; // nothing to take → lay it in the pool

  if (options.multiCapture) {
    // Take the union of every combination this card completes.
    const seen = new Set<string>();
    const union: Card[] = [];
    for (const subset of subsets) {
      for (const c of subset) {
        const k = cardKey(c);
        if (!seen.has(k)) {
          seen.add(k);
          union.push(c);
        }
      }
    }
    return [union];
  }

  return subsets;
}

/** All legal moves for `player` in the current state. Empty = not their turn. */
export function legalMoves(state: PasurState, player: PlayerId): PasurMove[] {
  if (state.phase !== "playing" || state.currentTurn !== player) return [];
  const hand = state.hands[player] ?? [];
  const moves: PasurMove[] = [];
  for (const card of hand) {
    for (const capture of captureOptionsFor(card, state.pool, state.options)) {
      moves.push({ type: "play", card, capture });
    }
  }
  return moves;
}

/** Order-independent set equality on cards. */
export function sameCardSet(a: Card[], b: Card[]): boolean {
  if (a.length !== b.length) return false;
  const keys = new Set(a.map(cardKey));
  return b.every((c) => keys.has(cardKey(c)));
}

export function moveEquals(a: PasurMove, b: PasurMove): boolean {
  return a.type === b.type && sameCard(a.card, b.card) && sameCardSet(a.capture, b.capture);
}

// ── Sur detection ────────────────────────────────────────────────────────────

/**
 * A Sur is clearing the pool by capturing — but never with a Jack, and never on
 * the final deal of the round. `clearsPool` is whether the pool is empty *after*
 * the capturing play.
 */
export function isSur(card: Card, clearsPool: boolean, isFinalDeal: boolean): boolean {
  if (!clearsPool) return false;
  if (card.rank === "J") return false;
  if (isFinalDeal) return false;
  return true;
}

// ── Scoring ──────────────────────────────────────────────────────────────────

export interface PlayerTally {
  cardPoints: number;
  clubsCount: number;
  clubsBonus: number;
  scoringSurs: number;
  surPoints: number;
  total: number;
}

function cardPointsOf(pile: Card[]): number {
  let pts = 0;
  for (const c of pile) {
    if (c.rank === "A") pts += 1;
    else if (c.rank === "J") pts += 1;
    else if (c.rank === "2" && c.suit === "clubs") pts += 2;
    else if (c.rank === "10" && c.suit === "diamonds") pts += 3;
  }
  return pts;
}

function clubsCountOf(pile: Card[]): number {
  return pile.filter((c) => c.suit === "clubs").length;
}

/**
 * Effective scoring-Sur counts after the two Sur toggles. `surDisabledAt50`
 * zeroes a player's Surs when their carry-in score is ≥ 50; `surTitForTat`
 * then keeps only the net difference between the two players.
 */
export function scoringSurCounts(state: PasurState): Record<PlayerId, number> {
  const eff: Record<PlayerId, number> = {};
  for (const p of state.players) {
    let s = state.surs[p] ?? 0;
    if (state.options.surDisabledAt50 && (state.baseScores[p] ?? 0) >= 50) s = 0;
    eff[p] = s;
  }
  if (state.options.surTitForTat && state.players.length === 2) {
    const [a, b] = state.players;
    const na = Math.max(0, eff[a] - eff[b]);
    const nb = Math.max(0, eff[b] - eff[a]);
    eff[a] = na;
    eff[b] = nb;
  }
  return eff;
}

/** Full end-of-game tally. Pure — does not mutate state. */
export function tally(state: PasurState): Record<PlayerId, PlayerTally> {
  const clubs: Record<PlayerId, number> = {};
  for (const p of state.players) clubs[p] = clubsCountOf(state.captured[p] ?? []);

  // Most clubs: a strict majority earns the flat bonus; a tie earns no one.
  const maxClubs = Math.max(...state.players.map((p) => clubs[p]));
  const leaders = state.players.filter((p) => clubs[p] === maxClubs && maxClubs > 0);
  const clubsWinner = leaders.length === 1 ? leaders[0] : null;

  const surCounts = scoringSurCounts(state);

  const result: Record<PlayerId, PlayerTally> = {};
  for (const p of state.players) {
    const cardPoints = cardPointsOf(state.captured[p] ?? []);
    const clubsBonus = p === clubsWinner ? CLUBS_MAJORITY_POINTS : 0;
    const scoringSurs = surCounts[p];
    const surPoints = scoringSurs * POOL_SUR_POINTS;
    result[p] = {
      cardPoints,
      clubsCount: clubs[p],
      clubsBonus,
      scoringSurs,
      surPoints,
      total: (state.baseScores[p] ?? 0) + cardPoints + clubsBonus + surPoints,
    };
  }
  return result;
}

export function finalScores(state: PasurState): Record<PlayerId, number> {
  const t = tally(state);
  const scores: Record<PlayerId, number> = {};
  for (const p of state.players) scores[p] = t[p].total;
  return scores;
}
