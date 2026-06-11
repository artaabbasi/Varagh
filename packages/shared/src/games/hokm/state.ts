import type { Card, PlayerId, PlayerViewBase, Suit } from "../../engine/game-engine";

export type HokmPhase = "choosingTrump" | "playing" | "gameOver";

export interface TrickPlay {
  playerId: PlayerId;
  card: Card;
}

export interface HokmState {
  phase: HokmPhase;
  /** Seats in canonical order. Teams: indices {0,2} vs {1,3}. */
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
  /** Tricks won this hand: [team0, team1] */
  tricksTaken: [number, number];
  /** Game points accumulated: [team0, team1] */
  scores: [number, number];
  handNumber: number;
  /** Game ends when a team reaches this many points (from variant options). */
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
  scores: [number, number];
  handNumber: number;
}
