import type { Card, PlayerId, PlayerViewBase } from "../../engine/game-engine";

export type PasurPhase = "playing" | "gameOver";

/**
 * Per-game toggles (all default OFF). Passed through the standard options
 * channel that `setup(ctx)` receives. Keep this shape extensible — adding a
 * future Pasur option means adding a field here and a variant option entry.
 */
export interface PasurOptions {
  /** A player at 50+ points (as of the last tally) cannot score a Sur. */
  surDisabledAt50: boolean;
  /** An opponent's later Sur cancels one of yours; only the net count scores. */
  surTitForTat: boolean;
  /** When one played card completes several sum-to-11 combinations, take all
   *  of them at once. OFF (default) = the player picks one combination. */
  multiCapture: boolean;
}

/**
 * A move is always "play this card, taking exactly these pool cards". When a
 * numeral completes more than one distinct sum-to-11 combination, each
 * combination is its own move (the `capture` array differs) so the *player*
 * chooses — the engine never picks for them. An empty `capture` lays the card
 * face-up in the pool.
 */
export interface PasurMove {
  type: "play";
  card: Card;
  capture: Card[];
}

export interface PasurState {
  phase: PasurPhase;
  /** Seat order = turn order. v1 shipped variant is 2-player. */
  players: PlayerId[];
  /** Each player's current hand (≤ 4 cards). */
  hands: Record<PlayerId, Card[]>;
  /** Face-up central pool. */
  pool: Card[];
  /** Face-down capture piles, per player. */
  captured: Record<PlayerId, Card[]>;
  /** Surs scored so far, per player. */
  surs: Record<PlayerId, number>;
  /** Undealt remainder of the deck. */
  deck: Card[];
  currentTurn: PlayerId | null;
  /** Seat index that leads each fresh deal. */
  leaderIndex: number;
  /** The last player to make a capture — takes the leftover pool at deck-out. */
  lastCapturer: PlayerId | null;
  /** True once the deck has been emptied by the final deal — no Surs on it. */
  isFinalDeal: boolean;
  options: PasurOptions;
  /**
   * Score as of the last tally — what the "Sur disabled at 50+" rule reads.
   * In the single-round v1 these stay 0; kept in state so the rule is correct
   * and forward-compatible once multi-round play is added.
   */
  baseScores: Record<PlayerId, number>;
  /** Final scores, filled in when the game ends (null-equivalent: all 0 until then). */
  scores: Record<PlayerId, number>;
}

export interface PasurView extends PlayerViewBase {
  phase: PasurPhase;
  players: PlayerId[];
  /** This player's own hand — never anyone else's. */
  hand: Card[];
  /** Card count per seat (opponents' hand sizes, not their cards). */
  handSizes: number[];
  pool: Card[];
  /** Face-down pile sizes per seat (public — the contents stay hidden). */
  capturedCounts: number[];
  /** Surs scored per seat (public — clearing the pool is visible to all). */
  surs: number[];
  lastCapturer: PlayerId | null;
  /** Cards still undealt. */
  deckCount: number;
  isFinalDeal: boolean;
  options: PasurOptions;
  /** Final per-seat scores once the game is over; null while still running. */
  scores: number[] | null;
}
