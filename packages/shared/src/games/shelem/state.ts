import type { Card, PlayerId, PlayerViewBase, Suit } from "../../engine/game-engine";

export type ShelemPhase = "bidding" | "zaminExchange" | "chooseTrump" | "playing" | "gameOver";

export interface TrickPlay {
  playerId: PlayerId;
  card: Card;
}

/**
 * Per-game toggles, surfaced as bilingual options in the create-game screen and
 * passed through the standard options channel that `setup(ctx)` receives. Keep
 * this shape extensible — future Shelem options slot in here and as variant
 * option entries.
 */
export interface ShelemOptions {
  /**
   * What a failed Hakem contract costs the Hakem's team:
   *  - "simple":  lose exactly the bid (negative).
   *  - "doubled": lose the bid, DOUBLED when the Hakem team scored less than
   *               the opponents.
   *  - "yasa":    if the Hakem team scored less than the opponents, they take
   *               the full round total (165 / 185) as negative.
   */
  failPenalty: "simple" | "doubled" | "yasa";
  /**
   * Zamin visibility before/while the Hakem exchanges:
   *  - "private": only the Hakem ever sees the 4 Zamin cards.
   *  - "reveal":  the 4 Zamin are face-up to everyone, then the Hakem takes them.
   * Drives `getPlayerView` redaction.
   */
  zaminReveal: "private" | "reveal";
  /**
   * Reward for a successful Shelem (slam):
   *  - "330":   a flat 330.
   *  - "bidX2": twice the Shelem's effective bid (the full round total), i.e.
   *             330 at aceValue 10, 370 at aceValue 15.
   */
  shelemReward: "330" | "bidX2";
  /** Each Ace is worth this many card-points: 10 (165-point round) or 15 (185). */
  aceValue: 10 | 15;
  /**
   * How a successful Hakem contract scores:
   *  - "bidExact": the team scores the bid amount (capped at the bid).
   *  - "actual":   the team scores the actual card-points it made (uncapped,
   *                may exceed the bid).
   */
  successScore: "bidExact" | "actual";
}

export type ShelemMove =
  /** Raise to a numeric contract (multiple of 5, strictly above the high bid). */
  | { type: "bid"; amount: number }
  /** Call the slam — outranks every numeric bid. */
  | { type: "bidShelem" }
  /** Drop out of the auction permanently. */
  | { type: "pass" }
  /** Hakem buries exactly 4 cards (from hand ∪ Zamin) into their team's pile. */
  | { type: "discard"; cards: Card[] }
  /** Hakem names the trump (حکم) suit after the Zamin exchange. */
  | { type: "chooseTrump"; suit: Suit }
  /** Play a card to the current trick. */
  | { type: "playCard"; card: Card };

export interface ShelemState {
  phase: ShelemPhase;
  /** Seats in canonical order. Teams: {0,2} vs {1,3}. */
  players: PlayerId[];
  /** Seat index of the dealer. Rotates one seat per round. */
  dealerIndex: number;
  /** Player → team slot (seat % 2). Constant across rounds. */
  teamMap: Record<PlayerId, number>;

  // ── Auction ────────────────────────────────────────────────────────────
  /** Seat whose turn it is to bid (null outside the bidding phase). */
  currentBidder: number | null;
  /** Highest numeric bid so far, or null if none (also null once shelem is high). */
  highBid: number | null;
  /** Seat holding the high bid / shelem call, or null if no bid yet. */
  highBidder: number | null;
  /** True once someone has called Shelem (the top of the ladder). */
  isShelemBid: boolean;
  /** Permanent pass flags, per seat. */
  passed: boolean[];

  // ── Contract (set when the auction resolves) ─────────────────────────────
  /** Declarer seat, or null before the auction resolves. */
  hakemIndex: number | null;
  /** Winning bid amount. For a Shelem this is the full round total. */
  contractBid: number | null;
  contractIsShelem: boolean;

  // ── Cards ────────────────────────────────────────────────────────────────
  hands: Record<PlayerId, Card[]>;
  /** The 4 face-down Zamin cards (held until the Hakem exchanges). */
  zamin: Card[];
  /** The trump (حکم) suit — null until the Hakem names it in the chooseTrump phase. */
  trumpSuit: Suit | null;
  currentTrick: TrickPlay[];
  trickLeaderIndex: number;
  currentTurn: PlayerId | null;

  // ── Capture & scoring ─────────────────────────────────────────────────────
  /** Cards captured in tricks this round, per team slot (index 0 / 1). Face-down. */
  capturedTeam: Card[][];
  /**
   * The 4 cards the Hakem buried at the Zamin exchange — they belong to the
   * Hakem's team's pile but are kept separate so their points stay hidden from
   * opponents until the round is tallied. At scoring this pile adds its
   * card-points plus one trick-equivalent (worth 5): the 12 played tricks plus
   * this buried "13th trick" bring the round total across both teams to 13×5.
   */
  zaminPile: Card[];
  /** Played tricks won this round, per team (the 12 real tricks; sum ≤ 12). */
  tricksWonTeam: number[];
  /** Cumulative game scores, per team. First to targetScore wins. */
  scores: number[];
  roundNumber: number;
  targetScore: number;
  options: ShelemOptions;
}

export interface ShelemView extends PlayerViewBase {
  phase: ShelemPhase;
  players: PlayerId[];
  dealerIndex: number;
  teamMap: Record<PlayerId, number>;

  /** Only this player's own cards. During the Hakem's exchange this is the 16
   *  (12 hand + 4 Zamin) they are choosing 4 to bury from. */
  hand: Card[];
  /** Card count per seat (opponents' hand sizes, not their cards). */
  handSizes: number[];
  /** The Zamin cards this player is allowed to see, else empty (redacted). */
  zamin: Card[];

  // Auction (public)
  currentBidder: number | null;
  highBid: number | null;
  highBidder: number | null;
  isShelemBid: boolean;
  passed: boolean[];

  // Contract (public)
  hakemIndex: number | null;
  contractBid: number | null;
  contractIsShelem: boolean;

  trumpSuit: Suit | null;
  currentTrick: TrickPlay[];
  trickLeaderIndex: number;

  /** Face-down pile sizes per team (public — contents stay hidden). */
  capturedCounts: number[];
  /** Trick-equivalents won per team (public). */
  tricksWonTeam: number[];
  /** Live card-points made per team this round (public — all tricks were seen). */
  teamPoints: number[];
  /** Cumulative per-team game scores, raced to targetScore. */
  scores: number[];
  roundNumber: number;
  targetScore: number;
  options: ShelemOptions;
}
