import type { Card, PlayerId, Rng, Suit } from "../../engine/game-engine";
import type { ShelemMove, ShelemState } from "./state";
import {
  BID_STEP,
  RANK_VALUE,
  SUITS,
  cardPointsOf,
  combinations,
  legalPlays,
  lowestCard,
  maxNumericBid,
  trickWinner,
} from "./rules";

/**
 * Shelem bot. Pure and deterministic. Like a real client it reads only what
 * `getPlayerView` would expose to this player — its own hand, the public auction
 * and trick state — never another seat's hand or the buried Zamin. Every move it
 * returns is one of `getValidMoves`. The human-like pacing is the server's job.
 */

// ── Hand strength → a target bid ──────────────────────────────────────────────

/** Rough card-point potential of a hand, used for both bidding and discarding. */
function handStrength(hand: Card[], aceValue: number): { best: Suit; estimate: number } {
  // Per-suit length and high-card weight.
  const bySuit: Record<Suit, Card[]> = { hearts: [], diamonds: [], clubs: [], spades: [] };
  for (const c of hand) bySuit[c.suit].push(c);

  let best: Suit = "spades";
  let bestScore = -1;
  for (const suit of SUITS) {
    const cards = bySuit[suit];
    // Long suits make good trump; high cards in it win tricks.
    const high = cards.filter(c => RANK_VALUE[c.rank] >= RANK_VALUE["J"]).length;
    const score = cards.length * 2 + high * 2;
    if (score > bestScore) {
      bestScore = score;
      best = suit;
    }
  }

  // Estimate: trump length wins tricks (×5), aces/tens/fives are card-points,
  // plus a small base. Deliberately conservative.
  const trumpLen = bySuit[best].length;
  const acesTens = cardPointsOf(hand, aceValue);
  const offAceKing = hand.filter(
    c => c.suit !== best && (c.rank === "A" || c.rank === "K"),
  ).length;
  const estimate = trumpLen * 5 + acesTens + offAceKing * 4 + 15;
  return { best, estimate };
}

export function shelemBidMove(state: ShelemState, player: PlayerId): ShelemMove {
  const hand = state.hands[player] ?? [];
  const aceValue = state.options.aceValue;
  const { estimate } = handStrength(hand, aceValue);

  // Round the estimate down to a bid on the 5-step ladder, then stay a notch
  // conservative so the bot doesn't routinely overbid.
  const target = Math.floor((estimate - 10) / BID_STEP) * BID_STEP;

  const floor = state.highBid === null ? BID_STEP : state.highBid + BID_STEP;
  const ceiling = maxNumericBid(aceValue);

  // A genuine monster (very strong) may call Shelem outright.
  if (!state.isShelemBid && estimate >= ceiling + 20) {
    return { type: "bidShelem" };
  }

  if (state.isShelemBid) return { type: "pass" }; // can't beat a slam
  if (target < floor || floor > ceiling) return { type: "pass" };

  const amount = Math.min(target, ceiling);
  if (amount < floor) return { type: "pass" };
  return { type: "bid", amount };
}

/** Name the strongest suit as trump — the long suit the bot built its bid on. */
export function shelemTrumpMove(state: ShelemState, player: PlayerId): ShelemMove {
  const hand = state.hands[player] ?? [];
  const { best } = handStrength(hand, state.options.aceValue);
  return { type: "chooseTrump", suit: best };
}

// ── Zamin discard ─────────────────────────────────────────────────────────────

/**
 * Bury the 4 weakest cards: shed short side-suits and low cards so the Hakem can
 * trump them out, while keeping aces/tens (card-points) and the long trump suit.
 */
export function shelemDiscardMove(state: ShelemState): ShelemMove {
  const hakem = state.players[state.hakemIndex!];
  const holding = [...(state.hands[hakem] ?? []), ...state.zamin];
  const aceValue = state.options.aceValue;
  const { best } = handStrength(holding, aceValue);

  const counts: Record<Suit, number> = { hearts: 0, diamonds: 0, clubs: 0, spades: 0 };
  for (const c of holding) counts[c.suit]++;

  const cardCost = (c: Card): number => {
    let cost = RANK_VALUE[c.rank]; // lower rank = cheaper to bury
    if (c.suit === best) cost += 100; // never bury trump if avoidable
    if (c.rank === "A") cost += 60;
    else if (c.rank === "10") cost += 40;
    else if (c.rank === "5") cost += 15;
    else if (c.rank === "K") cost += 8;
    // Shedding a whole short non-trump suit creates a void to trump into.
    if (c.suit !== best && counts[c.suit] <= 2) cost -= 6;
    return cost;
  };

  const sorted = [...holding].sort((a, b) => cardCost(a) - cardCost(b));
  // Guard against accidentally proposing a non-legal set — combinations() over
  // the holding is the ground truth, but the 4 cheapest distinct cards always
  // form a valid discard, so use them directly.
  const cards = sorted.slice(0, 4);
  // Defensive: if rounding produced fewer than 4 (impossible with 16), fall back.
  if (cards.length < 4) return { type: "discard", cards: combinations(holding, 4)[0] };
  return { type: "discard", cards };
}

// ── Card play ─────────────────────────────────────────────────────────────────

const POINT_RANKS = new Set(["A", "10", "5"]);

function cardValue(c: Card, aceValue: number): number {
  if (c.rank === "A") return aceValue;
  if (c.rank === "10") return 10;
  if (c.rank === "5") return 5;
  return 0;
}

export function shelemPlayMove(state: ShelemState, player: PlayerId, _rng: Rng): ShelemMove {
  const hand = state.hands[player] ?? [];
  const legal = legalPlays(hand, state.currentTrick);
  const trump = state.trumpSuit;
  const aceValue = state.options.aceValue;
  const myTeam = state.teamMap[player];

  // Leading: open the strongest card of a non-trump suit when holding length,
  // otherwise just lead the lowest to probe. Keep it simple but not silly.
  if (state.currentTrick.length === 0) {
    // Prefer leading a high card that is likely to win and pull points.
    const nonTrumpHigh = legal
      .filter(c => c.suit !== trump && RANK_VALUE[c.rank] >= RANK_VALUE["K"])
      .sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
    if (nonTrumpHigh.length > 0) return { type: "playCard", card: nonTrumpHigh[0] };
    return { type: "playCard", card: lowestCard(legal) };
  }

  // Following: figure out who is currently winning the trick.
  const winnerSoFar = trickWinner(state.currentTrick, trump);
  const partnerWinning = state.teamMap[winnerSoFar] === myTeam;
  const pointsInTrick = state.currentTrick.reduce((s, tp) => s + cardValue(tp.card, aceValue), 0);

  if (partnerWinning) {
    // Partner has it — feed points if we hold any spare point cards, else duck low.
    const pointCard = legal
      .filter(c => POINT_RANKS.has(c.rank))
      .sort((a, b) => cardValue(b, aceValue) - cardValue(a, aceValue))[0];
    if (pointCard) return { type: "playCard", card: pointCard };
    return { type: "playCard", card: lowestCard(legal) };
  }

  // Opponent winning — try to take the trick, cheapest winning card first.
  const ledSuit = state.currentTrick[0].card.suit;
  const winners = legal.filter(c => {
    const hypothetical = [...state.currentTrick, { playerId: player, card: c }];
    return trickWinner(hypothetical, trump) === player;
  });
  if (winners.length > 0 && (pointsInTrick > 0 || ledSuit === trump)) {
    // Win as cheaply as possible (prefer non-trump, then lowest rank).
    winners.sort((a, b) => {
      const at = a.suit === trump ? 1 : 0;
      const bt = b.suit === trump ? 1 : 0;
      if (at !== bt) return at - bt;
      return RANK_VALUE[a.rank] - RANK_VALUE[b.rank];
    });
    return { type: "playCard", card: winners[0] };
  }

  // Can't or shouldn't win — throw the lowest non-point card.
  const junk = legal
    .filter(c => !POINT_RANKS.has(c.rank))
    .sort((a, b) => RANK_VALUE[a.rank] - RANK_VALUE[b.rank]);
  if (junk.length > 0) return { type: "playCard", card: junk[0] };
  return { type: "playCard", card: lowestCard(legal) };
}
