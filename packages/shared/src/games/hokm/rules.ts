import type { Card, GameEvent, PlayerId, Rank, Suit } from "../../engine/game-engine";
import type { TrickPlay } from "./state";

export const SUITS: readonly Suit[] = ["hearts", "diamonds", "clubs", "spades"];
export const RANKS: readonly Rank[] = [
  "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A",
];

const RANK_VALUE: Record<Rank, number> = {
  "2": 2,  "3": 3,  "4": 4,  "5": 5,  "6": 6,  "7": 7,
  "8": 8,  "9": 9,  "10": 10, "J": 11, "Q": 12, "K": 13, "A": 14,
};

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

/** 51-card deck for 3-player Hokm: standard 52 minus the 2 of hearts. */
export function createDeck3p(): Card[] {
  return createDeck().filter(c => !(c.suit === "hearts" && c.rank === "2"));
}

/** Team index (0 or 1) for the given player: seats 0,2 → team 0; seats 1,3 → team 1. */
export function teamOf(players: PlayerId[], playerId: PlayerId): 0 | 1 {
  return (players.indexOf(playerId) % 2) as 0 | 1;
}

/** True if `challenger` beats the current trick-winner `current`. */
function beats(challenger: Card, current: Card, ledSuit: Suit, trump: Suit): boolean {
  const cT = challenger.suit === trump;
  const wT = current.suit === trump;
  if (cT && !wT) return true;
  if (!cT && wT) return false;
  if (cT)        return RANK_VALUE[challenger.rank] > RANK_VALUE[current.rank];
  // Neither is trump
  if (challenger.suit === ledSuit && current.suit !== ledSuit) return true;
  if (challenger.suit !== ledSuit) return false;
  return RANK_VALUE[challenger.rank] > RANK_VALUE[current.rank];
}

/** Returns the PlayerId who wins the completed trick. */
export function trickWinner(trick: TrickPlay[], trump: Suit): PlayerId {
  const ledSuit = trick[0].card.suit;
  let winnerIdx = 0;
  for (let i = 1; i < trick.length; i++) {
    if (beats(trick[i].card, trick[winnerIdx].card, ledSuit, trump)) winnerIdx = i;
  }
  return trick[winnerIdx].playerId;
}

/** True if the player holds at least one card of `suit`. */
export function hasLedSuit(hand: Card[], suit: Suit): boolean {
  return hand.some(c => c.suit === suit);
}

/** True if playing `card` right now is legal. */
export function isLegalPlay(hand: Card[], card: Card, trick: TrickPlay[]): boolean {
  if (!hand.some(c => c.suit === card.suit && c.rank === card.rank)) return false;
  if (trick.length > 0) {
    const ledSuit = trick[0].card.suit;
    if (hasLedSuit(hand, ledSuit) && card.suit !== ledSuit) return false;
  }
  return true;
}

/**
 * All cards the player may legally play.
 * When unable to follow suit, the full hand is returned (trumping is not mandatory).
 */
export function legalPlays(hand: Card[], trick: TrickPlay[]): Card[] {
  if (trick.length === 0) return [...hand];
  const ledSuit = trick[0].card.suit;
  const suited = hand.filter(c => c.suit === ledSuit);
  return suited.length > 0 ? suited : [...hand];
}

export interface HandScore {
  pointsGained: [number, number];
  isKot: boolean;
  isHakemKot: boolean;
  winnerTeam: 0 | 1;
}

/** Score a completed hand and determine point gain per team. */
export function scoreHand(
  tricksTaken: [number, number],
  hakemTeamIndex: 0 | 1
): HandScore {
  const winnerTeam: 0 | 1 = tricksTaken[0] >= 7 ? 0 : 1;
  const loserTeam: 0 | 1 = winnerTeam === 0 ? 1 : 0;
  const isKot = tricksTaken[loserTeam] === 0;
  const isHakemKot = isKot && winnerTeam !== hakemTeamIndex;

  let pts = 1;
  if (isHakemKot) pts = 3;
  else if (isKot) pts = 2;

  const pointsGained: [number, number] = [0, 0];
  pointsGained[winnerTeam] = pts;
  return { pointsGained, isKot, isHakemKot, winnerTeam };
}

/** Build public events emitted when a hand finishes. */
export function handOverEvents(
  tricksTaken: [number, number],
  newScores: number[],
  score: HandScore
): GameEvent[] {
  const events: GameEvent[] = [];
  if (score.isHakemKot) {
    events.push({
      type: "hakemKot",
      data: { winnerTeam: score.winnerTeam },
      visibility: { kind: "public" },
    });
  } else if (score.isKot) {
    events.push({
      type: "kot",
      data: { winnerTeam: score.winnerTeam },
      visibility: { kind: "public" },
    });
  }
  events.push({
    type: "handOver",
    data: {
      tricksTaken,
      winnerTeam: score.winnerTeam,
      pointsGained: score.pointsGained[score.winnerTeam],
      scores: newScores,
    },
    visibility: { kind: "public" },
  });
  return events;
}

/** The lowest-ranked card in the list. */
export function lowestCard(cards: Card[]): Card {
  return cards.reduce((best, c) =>
    RANK_VALUE[c.rank] < RANK_VALUE[best.rank] ? c : best
  );
}

/** The suit most represented in the hand (for a sensible default trump choice). */
export function mostCommonSuit(hand: Card[]): Suit {
  const counts: Partial<Record<Suit, number>> = {};
  for (const c of hand) counts[c.suit] = (counts[c.suit] ?? 0) + 1;
  return (Object.entries(counts) as [Suit, number][])
    .sort((a, b) => b[1] - a[1])[0][0];
}
