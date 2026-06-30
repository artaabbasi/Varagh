import type { Card, PlayerId, Rank, Suit } from "../../engine/game-engine";
import type { ShelemMove, ShelemOptions, ShelemState, TrickPlay } from "./state";

export const SUITS: readonly Suit[] = ["hearts", "diamonds", "clubs", "spades"];
export const RANKS: readonly Rank[] = [
  "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A",
];

/** Rank strength for trick resolution. A is high, 2 is low. */
export const RANK_VALUE: Record<Rank, number> = {
  "2": 2,  "3": 3,  "4": 4,  "5": 5,  "6": 6,  "7": 7,
  "8": 8,  "9": 9,  "10": 10, "J": 11, "Q": 12, "K": 13, "A": 14,
};

const SUIT_SORT_ORDER: Record<string, number> = { spades: 1, hearts: 2, diamonds: 3, clubs: 4 };

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ suit, rank });
  }
  return deck;
}

export function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

export function cardKey(c: Card): string {
  return `${c.rank}-${c.suit}`;
}

/** Sort a hand: trump first, then spades/hearts/diamonds/clubs, rank high-to-low. */
export function sortHand(cards: Card[], trump: Suit | null): Card[] {
  return [...cards].sort((a, b) => {
    const sa = trump && a.suit === trump ? 0 : SUIT_SORT_ORDER[a.suit] ?? 5;
    const sb = trump && b.suit === trump ? 0 : SUIT_SORT_ORDER[b.suit] ?? 5;
    if (sa !== sb) return sa - sb;
    return RANK_VALUE[b.rank] - RANK_VALUE[a.rank];
  });
}

// ── Trick resolution ─────────────────────────────────────────────────────────

/** True if `challenger` beats the current trick-winner `current`. */
function beats(challenger: Card, current: Card, ledSuit: Suit, trump: Suit | null): boolean {
  const cT = trump !== null && challenger.suit === trump;
  const wT = trump !== null && current.suit === trump;
  if (cT && !wT) return true;
  if (!cT && wT) return false;
  if (cT) return RANK_VALUE[challenger.rank] > RANK_VALUE[current.rank];
  if (challenger.suit === ledSuit && current.suit !== ledSuit) return true;
  if (challenger.suit !== ledSuit) return false;
  return RANK_VALUE[challenger.rank] > RANK_VALUE[current.rank];
}

/**
 * The PlayerId who wins the completed trick. `trump` may be null only for the
 * very first card of the round (the Hakem's opening lead retroactively sets
 * trump) — by the time a trick is complete, trump is always defined.
 */
export function trickWinner(trick: TrickPlay[], trump: Suit | null): PlayerId {
  const ledSuit = trick[0].card.suit;
  let winnerIdx = 0;
  for (let i = 1; i < trick.length; i++) {
    if (beats(trick[i].card, trick[winnerIdx].card, ledSuit, trump)) winnerIdx = i;
  }
  return trick[winnerIdx].playerId;
}

export function hasLedSuit(hand: Card[], suit: Suit): boolean {
  return hand.some(c => c.suit === suit);
}

/** True if playing `card` right now is legal (follow suit when able). */
export function isLegalPlay(hand: Card[], card: Card, trick: TrickPlay[]): boolean {
  if (!hand.some(c => sameCard(c, card))) return false;
  if (trick.length > 0) {
    const ledSuit = trick[0].card.suit;
    if (hasLedSuit(hand, ledSuit) && card.suit !== ledSuit) return false;
  }
  return true;
}

/**
 * All cards the player may legally play. Leading a trick allows any card (the
 * Hakem's first lead even sets trump). When following, suit must be matched if
 * held; otherwise any card (trumping is never mandatory).
 */
export function legalPlays(hand: Card[], trick: TrickPlay[]): Card[] {
  if (trick.length === 0) return [...hand];
  const ledSuit = trick[0].card.suit;
  const suited = hand.filter(c => c.suit === ledSuit);
  return suited.length > 0 ? suited : [...hand];
}

/** The lowest-ranked card in the list (for forced/default plays). */
export function lowestCard(cards: Card[]): Card {
  return cards.reduce((best, c) => (RANK_VALUE[c.rank] < RANK_VALUE[best.rank] ? c : best));
}

// ── Card-points & round total ──────────────────────────────────────────────

/**
 * Card-points in a pile: each Ace = aceValue (10 or 15), each 10 = 10, each
 * 5 = 5. Court cards and other numerals are worth nothing. Trick-equivalents
 * (5 each) are counted separately from this.
 */
export function cardPointsOf(pile: Card[], aceValue: number): number {
  let pts = 0;
  for (const c of pile) {
    if (c.rank === "A") pts += aceValue;
    else if (c.rank === "10") pts += 10;
    else if (c.rank === "5") pts += 5;
  }
  return pts;
}

/** Number of trick-equivalents in a round: 12 played + 1 for the Zamin pile. */
export const TRICKS_PER_ROUND = 13;
export const TRICK_POINTS = 5;
export const BID_STEP = 5;

/** Total card-points available per round: 165 (aceValue 10) or 185 (aceValue 15). */
export function roundTotalPoints(aceValue: number): number {
  // 4 Aces + 4 tens + 4 fives, plus 13 trick-equivalents × 5.
  return 4 * aceValue + 4 * 10 + 4 * 5 + TRICKS_PER_ROUND * TRICK_POINTS;
}

/** Highest legal numeric bid: one step below the round total (slam claims the top). */
export function maxNumericBid(aceValue: number): number {
  return roundTotalPoints(aceValue) - BID_STEP;
}

// ── Bidding ────────────────────────────────────────────────────────────────

/**
 * Is `amount` a legal numeric raise given the current high bid? Must be a
 * positive multiple of 5, strictly above any existing numeric high, at or below
 * the numeric ceiling, and not attempted once a Shelem has been called.
 */
export function bidLegal(amount: number, highBid: number | null, isShelemBid: boolean, aceValue: number): boolean {
  if (isShelemBid) return false;
  if (!Number.isInteger(amount) || amount % BID_STEP !== 0) return false;
  if (amount < BID_STEP) return false;
  if (amount > maxNumericBid(aceValue)) return false;
  const floor = highBid === null ? BID_STEP : highBid + BID_STEP;
  return amount >= floor;
}

/** Every legal numeric bid value, ascending. */
export function numericBidOptions(highBid: number | null, isShelemBid: boolean, aceValue: number): number[] {
  if (isShelemBid) return [];
  const out: number[] = [];
  const floor = highBid === null ? BID_STEP : highBid + BID_STEP;
  for (let v = floor; v <= maxNumericBid(aceValue); v += BID_STEP) out.push(v);
  return out;
}

// ── Combinations (for Zamin discard enumeration) ─────────────────────────────

/** All k-card subsets of `cards`. Used to enumerate legal Zamin discards. */
export function combinations<T>(cards: readonly T[], k: number): T[][] {
  const out: T[][] = [];
  const acc: T[] = [];
  const dfs = (start: number): void => {
    if (acc.length === k) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < cards.length; i++) {
      acc.push(cards[i]);
      dfs(i + 1);
      acc.pop();
    }
  };
  dfs(0);
  return out;
}

export function sameCardSet(a: Card[], b: Card[]): boolean {
  if (a.length !== b.length) return false;
  const keys = new Set(a.map(cardKey));
  return b.every(c => keys.has(cardKey(c)));
}

export function moveEquals(a: ShelemMove, b: ShelemMove): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "bid" && b.type === "bid") return a.amount === b.amount;
  if (a.type === "chooseTrump" && b.type === "chooseTrump") return a.suit === b.suit;
  if (a.type === "playCard" && b.type === "playCard") return sameCard(a.card, b.card);
  if (a.type === "discard" && b.type === "discard") return sameCardSet(a.cards, b.cards);
  // pass / bidShelem carry no payload.
  return true;
}

/** The suit most represented in a hand (a sensible default trump choice). */
export function mostCommonSuit(hand: Card[]): Suit {
  const counts: Record<Suit, number> = { hearts: 0, diamonds: 0, clubs: 0, spades: 0 };
  for (const c of hand) counts[c.suit]++;
  return SUITS.reduce((best, s) => (counts[s] > counts[best] ? s : best), SUITS[0]);
}

// ── Scoring ──────────────────────────────────────────────────────────────────

export interface RoundScore {
  /** Card-points (incl. trick-equivalents) made by each team this round. */
  made: number[];
  /** Score delta applied to each team's cumulative total. */
  delta: number[];
  hakemTeam: number;
  /** Did the Hakem's team fulfil its contract? */
  contractMade: boolean;
}

/**
 * Score a completed round under the chosen toggles. Pure.
 *
 * Opponents ALWAYS bank exactly the card-points they made. The Hakem team:
 *  - On success: scores the bid (bidExact) or the actual points (actual); a
 *    successful Shelem scores its reward (flat 330 or bid×2).
 *  - On failure: pays the failPenalty (simple / doubled / yasa), with a Shelem's
 *    effective bid being the full round total.
 */
export function scoreRound(state: ShelemState): RoundScore {
  const { options, contractBid, contractIsShelem, hakemIndex } = state;
  const aceValue = options.aceValue;
  const total = roundTotalPoints(aceValue);

  const hakemTeam = state.teamMap[state.players[hakemIndex!]];
  const oppTeam = hakemTeam === 0 ? 1 : 0;

  const made = [0, 1].map(
    t => cardPointsOf(state.capturedTeam[t] ?? [], aceValue) + (state.tricksWonTeam[t] ?? 0) * TRICK_POINTS,
  );
  // The buried Zamin pile belongs to the Hakem's team: its card-points plus one
  // trick-equivalent (the "13th trick"). This is the only place it is counted.
  made[hakemTeam] += cardPointsOf(state.zaminPile ?? [], aceValue) + TRICK_POINTS;
  const bid = contractBid ?? 0;

  const delta = [0, 0];
  // Opponents always score what they made.
  delta[oppTeam] = made[oppTeam];

  let contractMade: boolean;

  if (contractIsShelem) {
    // A slam requires winning every played trick — the opponents took none.
    contractMade = state.tricksWonTeam[oppTeam] === 0;
    if (contractMade) {
      delta[hakemTeam] = options.shelemReward === "bidX2" ? bid * 2 : 330;
    } else {
      delta[hakemTeam] = -failurePenalty(bid, made[hakemTeam], made[oppTeam], total, options.failPenalty);
    }
  } else {
    contractMade = made[hakemTeam] >= bid;
    if (contractMade) {
      delta[hakemTeam] = options.successScore === "actual" ? made[hakemTeam] : bid;
    } else {
      delta[hakemTeam] = -failurePenalty(bid, made[hakemTeam], made[oppTeam], total, options.failPenalty);
    }
  }

  return { made, delta, hakemTeam, contractMade };
}

function failurePenalty(
  bid: number,
  hakemMade: number,
  oppMade: number,
  total: number,
  mode: ShelemOptions["failPenalty"],
): number {
  const wentUnder = hakemMade < oppMade;
  switch (mode) {
    case "simple":
      return bid;
    case "doubled":
      return wentUnder ? bid * 2 : bid;
    case "yasa":
      return wentUnder ? total : bid;
  }
}
