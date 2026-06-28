import type { Card, PlayerId, PlayerViewBase, Suit } from "../../engine/game-engine";

export type HokmPhase = "choosingTrump" | "drawing" | "playing" | "gameOver";

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
   * Tricks won this hand, indexed by side.
   * 4p: length 2 — slot 0 = team {seats 0,2}, slot 1 = team {seats 1,3}.
   * 3p: length 3 — free-for-all, one slot per seat (each player's own tricks).
   * 2p: length 2 — one slot per seat.
   */
  tricksTaken: number[];
  /**
   * Maps each player to their tricksTaken/scores slot.
   * 4p: seat parity (seat % 2) — partners share a slot.
   * 2p/3p: the seat index itself — every player is their own slot.
   * Constant across hands.
   */
  teamMap: Record<PlayerId, number>;
  /**
   * Accumulated game points, indexed by the same slot as `tricksTaken`.
   * 4p: length 2 (per team). 2p: length 2 / 3p: length 3 (per player seat).
   */
  scores: number[];
  handNumber: number;
  /** Game ends when any score entry reaches this. */
  targetScore: number;
}

export type HokmMove =
  | { type: "chooseTrump"; suit: Suit }
  | { type: "playCard"; card: Card }
  /** 2p drawing phase: keep the seen card, discard the next stock card unseen. */
  | { type: "keepCard" }
  /** 2p drawing phase: discard the seen card, take the next stock card unseen. */
  | { type: "rejectCard" };

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
  /** Same shape as HokmState.tricksTaken — length 2 (4p teams / 2p seats) or 3 (3p seats). */
  tricksTaken: number[];
  /** Same shape as HokmState.scores — length 2 for 4p teams / 2p players, length 3 for 3p players. */
  scores: number[];
  handNumber: number;
  /**
   * 2p drawing phase only: the top stock card the active player is looking at.
   * null for the inactive player and for all non-drawing phases.
   */
  seenCard: Card | null;
  /** Cards remaining in the stock (drawing phase only). 0 outside the drawing phase. */
  stockCount: number;
}
