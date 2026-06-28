import type { Card, PlayerId } from "../../engine/game-engine";
import type { PasurMove, PasurState } from "./state";
import { cardKey, isSur, legalMoves } from "./rules";

/**
 * Pasur bot. Pure and deterministic. It only ever reads what
 * {@link import("./index").pasur.getPlayerView} would expose to this player —
 * its own hand, the public pool, and public flags — never another seat's hand,
 * anyone's face-down pile, or the undealt deck. It always returns a move that
 * is present in getValidMoves.
 *
 * Heuristic, aiming for competent play:
 *  - Capturing always beats laying a card down.
 *  - Among captures, value the take: 10♦ (3 pts) and 2♣ (2 pts) highest, then
 *    Aces and Jacks (1 pt each), then clubs (the 7-point majority race), with a
 *    big bonus for a Sur and a small one for sheer card count (also clubs race).
 *  - When nothing can be captured, lay the least valuable card so as not to
 *    gift the opponent points sitting in the pool.
 */

const SUR_BONUS = 6;

/** Heuristic worth of holding a card in your capture pile. */
function worth(c: Card): number {
  if (c.rank === "2" && c.suit === "clubs") return 3;
  if (c.rank === "10" && c.suit === "diamonds") return 4;
  let w = 0;
  if (c.rank === "A") w += 2;
  else if (c.rank === "J") w += 2;
  else if (c.rank === "Q" || c.rank === "K") w += 0.3;
  else w += 0.2;
  if (c.suit === "clubs") w += 1.5;
  return w;
}

function moveScore(state: PasurState, move: PasurMove): number {
  if (move.capture.length === 0) {
    // Laying a card down — strictly worse than any capture. Prefer to shed the
    // least valuable card (least to lose if the opponent scoops it next).
    return -worth(move.card) - 1;
  }
  let score = worth(move.card);
  for (const c of move.capture) score += worth(c);
  score += 0.1 * move.capture.length;

  // Would this capture clear the pool for a Sur?
  const capKeys = new Set(move.capture.map(cardKey));
  const clears = state.pool.every((c) => capKeys.has(cardKey(c)));
  if (isSur(move.card, clears, state.isFinalDeal)) score += SUR_BONUS;
  return score;
}

export function pasurBotMove(state: PasurState, player: PlayerId): PasurMove {
  const moves = legalMoves(state, player);
  // legalMoves guarantees at least one move on the bot's turn (it has cards).
  let best = moves[0];
  let bestScore = moveScore(state, best);
  for (let i = 1; i < moves.length; i++) {
    const s = moveScore(state, moves[i]);
    if (s > bestScore) {
      best = moves[i];
      bestScore = s;
    }
  }
  return best;
}
