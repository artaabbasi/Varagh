/**
 * GameEngine — the core plugin contract for the card games platform.
 *
 * Every game (Hokm, Shelem, Poker, ...) is one self-contained module that
 * exports a `GameDefinition`. The server/lobby code knows NOTHING about any
 * specific game — it only talks to this interface.
 *
 * Three non-negotiable design rules:
 *  1. PURE & DETERMINISTIC: engines are pure functions. No I/O, no Date.now(),
 *     no Math.random(). All randomness comes from the injected seeded RNG.
 *     Same state + same move = same result, always. (Enables replays, tests,
 *     and server/client state verification.)
 *  2. SERVER-AUTHORITATIVE: full state lives only on the server. Clients only
 *     ever receive the output of `getPlayerView()` — a redacted snapshot.
 *  3. EVENT-SOURCED RESULTS: `applyMove` returns the new state plus a list of
 *     events. The transport layer decides who may see each event.
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export type PlayerId = string;

export type Suit = "hearts" | "diamonds" | "clubs" | "spades";
export type Rank =
  | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10"
  | "J" | "Q" | "K" | "A";

export interface Card {
  suit: Suit;
  rank: Rank;
}

/** Seeded RNG injected by the platform — the ONLY allowed source of randomness. */
export interface Rng {
  /** Integer in [0, maxExclusive) */
  int(maxExclusive: number): number;
  /** Fisher–Yates shuffle, returns a new array */
  shuffle<T>(items: readonly T[]): T[];
}

// ---------------------------------------------------------------------------
// Game & variant metadata (drives the lobby UI — no game knowledge needed)
// ---------------------------------------------------------------------------

export interface VariantDefinition {
  /** e.g. "hokm-4p", "hokm-3p", "hokm-2p", "poker-holdem" */
  id: string;
  /** Localized display names, e.g. { en: "4-Player Hokm", fa: "حکم چهار نفره" } */
  name: Record<string, string>;
  minPlayers: number;
  maxPlayers: number;
  /** true for partnership games like 4p Hokm; lets the lobby render teams */
  hasTeams: boolean;
  /** Optional per-variant config the room creator can tweak (target score, etc.) */
  options?: VariantOption[];
}

export interface VariantOption {
  key: string;                       // e.g. "targetScore"
  name: Record<string, string>;
  type: "number" | "boolean" | "choice";
  default: unknown;
  choices?: unknown[];               // when type === "choice"
  /**
   * Optional localized labels for `type: "choice"` values, keyed by
   * `String(choice)`. The lobby renders these (falling back to the raw value)
   * so choice options aren't shown as bare identifiers in a non-English UI.
   */
  choiceLabels?: Record<string, Record<string, string>>;
  /** Optional bounds for `type: "number"` (the lobby renders a stepper). */
  min?: number;
  max?: number;
}

// ---------------------------------------------------------------------------
// Moves, events, views
// ---------------------------------------------------------------------------

/**
 * A move is anything a player does: play a card, pick trump, bid, fold, pass.
 * Each game defines its own move union type, but every move has a `type`.
 *
 * Hokm example:
 *   type HokmMove =
 *     | { type: "chooseTrump"; suit: Suit }
 *     | { type: "playCard"; card: Card };
 */
export interface MoveBase {
  type: string;
}

/**
 * Events describe what happened, for the UI/animation layer and the game log.
 * `visibility` lets the transport layer redact them correctly.
 */
export interface GameEvent {
  type: string;                      // e.g. "trickWon", "trumpChosen", "kot"
  data?: unknown;
  visibility:
    | { kind: "public" }                       // everyone in the room
    | { kind: "players"; ids: PlayerId[] }     // only these players
    | { kind: "private"; id: PlayerId };       // a single player (e.g. "you drew X")
}

/**
 * What one player is allowed to see. This is the ONLY thing that ever leaves
 * the server. Each game defines its own view type.
 *
 * Hokm example view: your own hand, cards on the table this trick, trump suit,
 * trick counts, scores, whose turn it is — but never opponents' hands.
 */
export interface PlayerViewBase {
  /** The player this view was built for */
  forPlayer: PlayerId;
  /** Whose turn it is (null between hands / during dealing animations) */
  currentTurn: PlayerId | null;
  /** Current phase, e.g. "choosingTrump" | "playing" | "handOver" | "gameOver" */
  phase: string;
}

// ---------------------------------------------------------------------------
// Setup context & move results
// ---------------------------------------------------------------------------

export interface SetupContext {
  variantId: string;
  /** Seat order is the canonical turn order. For team games, the platform
   *  guarantees partners sit across (index i is teamed with i + n/2). */
  players: PlayerId[];
  /** Resolved variant options (defaults merged with room creator's choices) */
  options: Record<string, unknown>;
  rng: Rng;
}

export type MoveResult<TState> =
  | { ok: true; state: TState; events: GameEvent[] }
  | { ok: false; error: MoveError };

export interface MoveError {
  code: "NOT_YOUR_TURN" | "INVALID_MOVE" | "WRONG_PHASE" | "RULE_VIOLATION";
  /** Localized, user-facing explanation, e.g. { en: "You must follow suit" } */
  message: Record<string, string>;
}

export interface GameOutcome {
  /** Winning players (all members of the winning team, or sole winner) */
  winners: PlayerId[];
  /** Final scores keyed by player or team id — game-specific shape */
  scores: Record<string, number>;
}

// ---------------------------------------------------------------------------
// THE contract every game module implements
// ---------------------------------------------------------------------------

export interface GameDefinition<
  TState,
  TMove extends MoveBase,
  TView extends PlayerViewBase
> {
  /** e.g. "hokm", "shelem", "poker" */
  id: string;
  name: Record<string, string>;
  variants: VariantDefinition[];

  /** Create the initial full game state (deal cards, pick Hakem, etc.) */
  setup(ctx: SetupContext): TState;

  /**
   * All legal moves for this player right now. Empty array = not their turn.
   * The UI uses this to highlight playable cards; the server uses it to
   * validate (applyMove must reject anything not in this list).
   */
  getValidMoves(state: TState, player: PlayerId): TMove[];

  /** Validate + apply a move. MUST be pure: return new state, never mutate. */
  applyMove(
    state: TState,
    player: PlayerId,
    move: TMove,
    rng: Rng
  ): MoveResult<TState>;

  /** Redact full state into what this one player may see. */
  getPlayerView(state: TState, player: PlayerId): TView;

  /** null while the game is still running */
  getOutcome(state: TState): GameOutcome | null;

  /**
   * Called by the platform when a player's turn timer expires or they
   * disconnect past the grace period. Return a reasonable forced move
   * (e.g. lowest legal card) so the table isn't blocked.
   */
  getDefaultMove(state: TState, player: PlayerId): TMove;

  /**
   * OPTIONAL bot brain. When present, the platform's generic bot-takeover hook
   * uses this to play computer seats and to substitute for a human who has
   * disconnected past the grace period — instead of the blunt getDefaultMove.
   * Games that omit it fall back to getDefaultMove, so existing games keep
   * working unchanged.
   *
   * MUST obey the same purity rules as the rest of the engine and, like a real
   * client, may only look at what {@link getPlayerView} would expose to this
   * player — never another seat's hand or the undealt deck. The returned move
   * MUST be one of {@link getValidMoves}. The human-like "thinking" pacing is
   * the platform's job (server timer layer), never the engine's.
   */
  getBotMove?(state: TState, player: PlayerId, rng: Rng): TMove;
}

// ---------------------------------------------------------------------------
// Registry — adding a game to the platform is ONE line here
// ---------------------------------------------------------------------------

// In packages/shared/games/index.ts:
//
//   import { hokm } from "./hokm";
//   // import { shelem } from "./shelem";   <- future games slot in like this
//
//   export const games: GameDefinition<any, any, any>[] = [
//     hokm,
//     // shelem,
//   ];