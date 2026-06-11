import type { Card, PlayerId, PlayerViewBase, Suit } from "../../engine/game-engine";

export type HokmPhase = "choosingTrump" | "playing" | "gameOver";

export interface TrickPlay {
  playerId: PlayerId;
  card: Card;
}

export interface HokmState {
  phase: HokmPhase;
  /** Seats in canonical order. 4p teams: indices {0,2} vs {1,3}. */
  players: PlayerId[];
  /** Seat index of the current Hakem. */
  hakemIndex: number;
  trump: Suit | null;
  hands: Record<PlayerId, Card[]>;
  /** Remaining deck held until Hakem picks trump, then emptied. */
  deckForDeal: Card[];
  /** Cards played so far in the current trick, in play order. */
  currentTrick: TrickPlay[];
  /** Seat index of the player who leads (or led) the current trick. */
  trickLeaderIndex: number;
  currentTurn: PlayerId | null;
  /**
   * Tricks won this hand, indexed by side (0 or 1).
   * 4p: slot 0 = team {seats 0,2}, slot 1 = team {seats 1,3}.
   * 3p: slot 0 = Hakem alone, slot 1 = combined opponents.
   */
  tricksTaken: [number, number];
  /**
   * Maps each player to their tricksTaken slot (0 or 1).
   * 4p: determined by seat parity (seat % 2). Constant across hands.
   * 3p: slot 0 = current Hakem, slot 1 = both opponents. Rebuilt each hand.
   */
  teamMap: Record<PlayerId, 0 | 1>;
  /**
   * Accumulated game points.
   * 4p: length 2 — indexed by team (slot 0 / slot 1).
   * 3p: length 3 — indexed by player seat, since the Hakem rotates.
   */
  scores: number[];
  handNumber: number;
  /** Game ends when any score entry reaches this. */
  targetScore: number;
}

export type HokmMove =
  | { type: "chooseTrump"; suit: Suit }
  | { type: "playCard"; card: Card };

export interface HokmView extends PlayerViewBase {
  phase: HokmPhase;
  players: PlayerId[];
  hakemIndex: number;
  trump: Suit | null;
  /** Only this player's cards. */
  hand: Card[];
  /** Card count per seat (opponents' hand sizes, not their cards). */
  handSizes: number[];
  currentTrick: TrickPlay[];
  trickLeaderIndex: number;
  tricksTaken: [number, number];
  /** Same shape as HokmState.scores — length 2 for 4p teams, length 3 for 3p players. */
  scores: number[];
  handNumber: number;
}
