import type {
  Card,
  GameDefinition,
  GameEvent,
  MoveError,
  MoveResult,
  PlayerId,
  Rng,
  Suit,
} from "../../engine/game-engine";
import type { ShelemMove, ShelemOptions, ShelemState, ShelemView } from "./state";
import {
  bidLegal,
  cardKey,
  cardPointsOf,
  combinations,
  createDeck,
  legalPlays,
  lowestCard,
  moveEquals,
  numericBidOptions,
  roundTotalPoints,
  sameCard,
  scoreRound,
  trickWinner,
} from "./rules";
import { shelemBidMove, shelemDiscardMove, shelemPlayMove } from "./bot";
import { variant4p } from "./variants/4p";

// ── Constants ────────────────────────────────────────────────────────────────

const HAND_SIZE = 12;
const ZAMIN_SIZE = 4;
const DISCARD_SIZE = 4;

// ── Module-level helpers ─────────────────────────────────────────────────────

function err(code: MoveError["code"], en: string, fa: string): MoveResult<ShelemState> {
  return { ok: false, error: { code, message: { en, fa } } };
}

function resolveOptions(raw: Record<string, unknown>): ShelemOptions {
  const failPenalty = raw.failPenalty as ShelemOptions["failPenalty"] | undefined;
  const zaminReveal = raw.zaminReveal as ShelemOptions["zaminReveal"] | undefined;
  const shelemReward = raw.shelemReward as ShelemOptions["shelemReward"] | undefined;
  const successScore = raw.successScore as ShelemOptions["successScore"] | undefined;
  const aceValue = Number(raw.aceValue) === 15 ? 15 : 10;
  return {
    failPenalty: failPenalty === "doubled" || failPenalty === "yasa" ? failPenalty : "simple",
    zaminReveal: zaminReveal === "reveal" ? "reveal" : "private",
    shelemReward: shelemReward === "bidX2" ? "bidX2" : "330",
    aceValue,
    successScore: successScore === "actual" ? "actual" : "bidExact",
  };
}

function buildTeamMap(players: PlayerId[]): Record<PlayerId, number> {
  const map: Record<PlayerId, number> = {};
  for (let i = 0; i < players.length; i++) map[players[i]] = i % 2;
  return map;
}

function removeOneCard(hand: Card[], card: Card): Card[] {
  let removed = false;
  return hand.filter(c => {
    if (!removed && sameCard(c, card)) {
      removed = true;
      return false;
    }
    return true;
  });
}

/** Shuffle a fresh deck and split it into four 12-card hands plus the 4-card Zamin. */
function freshDeal(players: PlayerId[], rng: Rng): { hands: Record<PlayerId, Card[]>; zamin: Card[] } {
  const shuffled = rng.shuffle(createDeck());
  const hands: Record<PlayerId, Card[]> = {};
  let i = 0;
  for (const p of players) {
    hands[p] = shuffled.slice(i, i + HAND_SIZE);
    i += HAND_SIZE;
  }
  const zamin = shuffled.slice(i, i + ZAMIN_SIZE);
  return { hands, zamin };
}

/**
 * Open a fresh round in the bidding phase: deal, reset the auction, and put the
 * first bidder (left of the dealer) on the clock. `roundNumber`/`dealerIndex`
 * are caller-controlled so this also serves all-pass re-deals.
 */
function openRound(
  base: Pick<ShelemState, "players" | "teamMap" | "scores" | "targetScore" | "options">,
  dealerIndex: number,
  roundNumber: number,
  rng: Rng,
): ShelemState {
  const n = base.players.length;
  const firstBidder = (dealerIndex + 1) % n;
  const { hands, zamin } = freshDeal(base.players, rng);
  return {
    phase: "bidding",
    players: base.players,
    dealerIndex,
    teamMap: base.teamMap,
    currentBidder: firstBidder,
    highBid: null,
    highBidder: null,
    isShelemBid: false,
    passed: base.players.map(() => false),
    hakemIndex: null,
    contractBid: null,
    contractIsShelem: false,
    hands,
    zamin,
    trumpSuit: null,
    currentTrick: [],
    trickLeaderIndex: firstBidder,
    currentTurn: base.players[firstBidder],
    capturedTeam: [[], []],
    zaminPile: [],
    tricksWonTeam: [0, 0],
    scores: base.scores,
    roundNumber,
    targetScore: base.targetScore,
    options: base.options,
  };
}

/** Next seat after the current bidder who is still active and not the high bidder. */
function nextBidderSeat(state: ShelemState): number | null {
  const n = state.players.length;
  for (let step = 1; step <= n; step++) {
    const idx = (state.currentBidder! + step) % n;
    if (!state.passed[idx] && idx !== state.highBidder) return idx;
  }
  return null;
}

// ── Auction resolution ───────────────────────────────────────────────────────

/**
 * Advance (or close) the auction after a bid/pass. Either hands the clock to the
 * next active bidder, resolves to the Hakem when only one bidder remains, or
 * re-deals (rotating the dealer) when everyone passed without a bid.
 */
function advanceAuction(state: ShelemState, events: GameEvent[], rng: Rng): MoveResult<ShelemState> {
  const next = nextBidderSeat(state);
  if (next !== null) {
    return { ok: true, state: { ...state, currentBidder: next, currentTurn: state.players[next] }, events };
  }

  if (state.highBidder === null) {
    // Everyone passed with no bid — void deal, rotate the dealer, deal afresh.
    const newDealer = (state.dealerIndex + 1) % state.players.length;
    const redealt = openRound(state, newDealer, state.roundNumber, rng);
    events.push({ type: "redeal", data: { dealerIndex: newDealer }, visibility: { kind: "public" } });
    return { ok: true, state: redealt, events };
  }

  // One bidder left — they win the contract and move to the Zamin exchange.
  const hakemIndex = state.highBidder;
  const contractBid = state.isShelemBid ? roundTotalPoints(state.options.aceValue) : state.highBid!;
  events.push({
    type: "auctionWon",
    data: { hakemIndex, bid: contractBid, shelem: state.isShelemBid },
    visibility: { kind: "public" },
  });
  return {
    ok: true,
    state: {
      ...state,
      phase: "zaminExchange",
      hakemIndex,
      contractBid,
      contractIsShelem: state.isShelemBid,
      currentBidder: null,
      currentTurn: state.players[hakemIndex],
    },
    events,
  };
}

function applyBid(state: ShelemState, seat: number, amount: number, rng: Rng): MoveResult<ShelemState> {
  const next: ShelemState = { ...state, highBid: amount, highBidder: seat };
  const events: GameEvent[] = [
    { type: "bidPlaced", data: { seat, amount, shelem: false }, visibility: { kind: "public" } },
  ];
  return advanceAuction(next, events, rng);
}

function applyShelem(state: ShelemState, seat: number, rng: Rng): MoveResult<ShelemState> {
  const next: ShelemState = { ...state, highBid: null, highBidder: seat, isShelemBid: true };
  const events: GameEvent[] = [
    { type: "bidPlaced", data: { seat, amount: null, shelem: true }, visibility: { kind: "public" } },
  ];
  return advanceAuction(next, events, rng);
}

function applyPass(state: ShelemState, seat: number, rng: Rng): MoveResult<ShelemState> {
  const passed = [...state.passed];
  passed[seat] = true;
  const next: ShelemState = { ...state, passed };
  const events: GameEvent[] = [
    { type: "passed", data: { seat }, visibility: { kind: "public" } },
  ];
  return advanceAuction(next, events, rng);
}

// ── Zamin exchange ───────────────────────────────────────────────────────────

/** The 16 cards the Hakem is choosing from during the exchange (hand ∪ Zamin). */
function hakemHolding(state: ShelemState): Card[] {
  const hakem = state.players[state.hakemIndex!];
  return [...(state.hands[hakem] ?? []), ...state.zamin];
}

function isValidDiscard(holding: Card[], cards: Card[]): boolean {
  if (cards.length !== DISCARD_SIZE) return false;
  const keys = new Set<string>();
  for (const c of cards) {
    const k = cardKey(c);
    if (keys.has(k)) return false; // no duplicates
    keys.add(k);
  }
  const available = new Set(holding.map(cardKey));
  return cards.every(c => available.has(cardKey(c)));
}

function applyDiscard(state: ShelemState, cards: Card[]): MoveResult<ShelemState> {
  const hakem = state.players[state.hakemIndex!];
  const holding = hakemHolding(state);
  const discardKeys = new Set(cards.map(cardKey));
  const newHand = holding.filter(c => !discardKeys.has(cardKey(c)));

  const events: GameEvent[] = [
    // Public: opponents see that 4 cards were buried, never which ones.
    { type: "zaminDiscarded", data: { hakemIndex: state.hakemIndex }, visibility: { kind: "public" } },
    // Private: the Hakem keeps a record of what they buried.
    { type: "discardBuried", data: { cards }, visibility: { kind: "private", id: hakem } },
  ];

  // The buried pile is credited to the Hakem's team's tally only at round end
  // (see scoreRound); capturedTeam still holds only trick cards until then.
  return {
    ok: true,
    state: {
      ...state,
      phase: "playing",
      hands: { ...state.hands, [hakem]: newHand },
      zamin: [],
      zaminPile: cards,
      trickLeaderIndex: state.hakemIndex!,
      currentTrick: [],
      currentTurn: hakem,
    },
    events,
  };
}

// ── Trick play ───────────────────────────────────────────────────────────────

function applyPlayCard(state: ShelemState, player: PlayerId, card: Card, rng: Rng): MoveResult<ShelemState> {
  const playerIdx = state.players.indexOf(player);
  const newHands = { ...state.hands, [player]: removeOneCard(state.hands[player] ?? [], card) };
  const newTrick = [...state.currentTrick, { playerId: player, card }];

  const events: GameEvent[] = [];

  // The Hakem's very first lead retroactively sets trump.
  let trumpSuit = state.trumpSuit;
  if (trumpSuit === null) {
    trumpSuit = card.suit;
    events.push({ type: "trumpSet", data: { suit: trumpSuit }, visibility: { kind: "public" } });
  }

  events.push({ type: "cardPlayed", data: { playerId: player, card }, visibility: { kind: "public" } });

  // Trick still in progress — advance the turn.
  if (newTrick.length < state.players.length) {
    const nextIdx = (playerIdx + 1) % state.players.length;
    return {
      ok: true,
      state: { ...state, hands: newHands, currentTrick: newTrick, trumpSuit, currentTurn: state.players[nextIdx] },
      events,
    };
  }

  // ── Trick complete ───────────────────────────────────────────────────────
  const winnerId = trickWinner(newTrick, trumpSuit);
  const winnerTeam = state.teamMap[winnerId];
  const winnerIdx = state.players.indexOf(winnerId);

  const capturedTeam = [ [...state.capturedTeam[0]], [...state.capturedTeam[1]] ];
  for (const tp of newTrick) capturedTeam[winnerTeam].push(tp.card);
  const tricksWonTeam = [...state.tricksWonTeam];
  tricksWonTeam[winnerTeam]++;

  events.push({ type: "trickWon", data: { winnerId, trick: newTrick }, visibility: { kind: "public" } });

  const handsEmpty = state.players.every(p => (newHands[p] ?? []).length === 0);

  if (!handsEmpty) {
    return {
      ok: true,
      state: {
        ...state,
        hands: newHands,
        currentTrick: [],
        trumpSuit,
        trickLeaderIndex: winnerIdx,
        currentTurn: winnerId,
        capturedTeam,
        tricksWonTeam,
      },
      events,
    };
  }

  // ── Round complete — tally and either deal the next round or end the game ──
  const roundEndState: ShelemState = {
    ...state,
    hands: newHands,
    currentTrick: [],
    trumpSuit,
    capturedTeam,
    tricksWonTeam,
  };
  const score = scoreRound(roundEndState);
  const newScores = [
    roundEndState.scores[0] + score.delta[0],
    roundEndState.scores[1] + score.delta[1],
  ];

  events.push({
    type: "roundOver",
    data: {
      roundNumber: state.roundNumber,
      hakemTeam: score.hakemTeam,
      contractBid: state.contractBid,
      contractIsShelem: state.contractIsShelem,
      made: score.made,
      delta: score.delta,
      contractMade: score.contractMade,
      scores: newScores,
    },
    visibility: { kind: "public" },
  });

  // Game over: a team has reached the target score.
  if (newScores.some(s => s >= state.targetScore)) {
    const winnerTeamFinal = newScores[0] === newScores[1]
      ? score.hakemTeam
      : newScores[0] > newScores[1] ? 0 : 1;
    events.push({ type: "gameOver", data: { winnerTeam: winnerTeamFinal, scores: newScores }, visibility: { kind: "public" } });
    return {
      ok: true,
      state: { ...roundEndState, phase: "gameOver", scores: newScores, currentTurn: null },
      events,
    };
  }

  // Otherwise rotate the dealer and deal the next round's bidding.
  const newDealer = (state.dealerIndex + 1) % state.players.length;
  const nextRound = openRound(
    { ...roundEndState, scores: newScores },
    newDealer,
    state.roundNumber + 1,
    rng,
  );
  return { ok: true, state: nextRound, events };
}

// ── GameDefinition ───────────────────────────────────────────────────────────

export const shelem: GameDefinition<ShelemState, ShelemMove, ShelemView> = {
  id: "shelem",
  name: { en: "Shelem", fa: "شلم" },
  variants: [variant4p],

  setup(ctx) {
    const { players, rng } = ctx;
    const options = resolveOptions(ctx.options);
    const targetScore = (ctx.options.targetScore as number | undefined) ?? 1165;
    const teamMap = buildTeamMap(players);
    // First dealer is the last seat, so the first bidder is seat 0.
    const dealerIndex = players.length - 1;
    return openRound({ players, teamMap, scores: [0, 0], targetScore, options }, dealerIndex, 0, rng);
  },

  getValidMoves(state, player) {
    if (state.currentTurn !== player) return [];
    const seat = state.players.indexOf(player);

    if (state.phase === "bidding") {
      if (state.currentBidder !== seat) return [];
      const moves: ShelemMove[] = [{ type: "pass" }];
      for (const amount of numericBidOptions(state.highBid, state.isShelemBid, state.options.aceValue)) {
        moves.push({ type: "bid", amount });
      }
      if (!state.isShelemBid) moves.push({ type: "bidShelem" });
      return moves;
    }

    if (state.phase === "zaminExchange") {
      if (state.hakemIndex !== seat) return [];
      return combinations(hakemHolding(state), DISCARD_SIZE).map(cards => ({ type: "discard" as const, cards }));
    }

    if (state.phase === "playing") {
      return legalPlays(state.hands[player] ?? [], state.currentTrick).map(card => ({
        type: "playCard" as const,
        card,
      }));
    }

    return [];
  },

  applyMove(state, player, move, rng) {
    if (state.phase === "gameOver")
      return err("WRONG_PHASE", "The game is over.", "بازی تمام شده است.");
    if (state.currentTurn !== player)
      return err("NOT_YOUR_TURN", "It is not your turn.", "نوبت شما نیست.");

    const seat = state.players.indexOf(player);

    switch (state.phase) {
      case "bidding": {
        if (state.currentBidder !== seat)
          return err("NOT_YOUR_TURN", "It is not your turn to bid.", "نوبت پیشنهاد شما نیست.");
        if (move.type === "pass") return applyPass(state, seat, rng);
        if (move.type === "bidShelem") {
          if (state.isShelemBid)
            return err("RULE_VIOLATION", "Shelem has already been called.", "شلم قبلاً اعلام شده است.");
          return applyShelem(state, seat, rng);
        }
        if (move.type === "bid") {
          if (!bidLegal(move.amount, state.highBid, state.isShelemBid, state.options.aceValue))
            return err("RULE_VIOLATION", "That bid is not legal.", "این پیشنهاد مجاز نیست.");
          return applyBid(state, seat, move.amount, rng);
        }
        return err("INVALID_MOVE", "That move is not legal right now.", "این حرکت مجاز نیست.");
      }

      case "zaminExchange": {
        if (state.hakemIndex !== seat)
          return err("NOT_YOUR_TURN", "Only the Hakem exchanges the Zamin.", "فقط حاکم زمین را عوض می‌کند.");
        if (move.type !== "discard")
          return err("INVALID_MOVE", "You must bury exactly 4 cards.", "باید دقیقاً ۴ کارت زمین کنید.");
        if (!isValidDiscard(hakemHolding(state), move.cards))
          return err("RULE_VIOLATION", "Pick exactly 4 cards from your hand to bury.", "دقیقاً ۴ کارت از دست خود برای زمین انتخاب کنید.");
        return applyDiscard(state, move.cards);
      }

      case "playing": {
        if (move.type !== "playCard")
          return err("INVALID_MOVE", "That move is not legal right now.", "این حرکت مجاز نیست.");
        const inHand = (state.hands[player] ?? []).some(c => sameCard(c, move.card));
        if (!inHand)
          return err("INVALID_MOVE", "That card is not in your hand.", "این کارت در دست شما نیست.");
        const legal = legalPlays(state.hands[player] ?? [], state.currentTrick);
        if (!legal.some(c => sameCard(c, move.card)))
          return err("RULE_VIOLATION", "You must follow suit.", "باید همرنگ بیاورید.");
        return applyPlayCard(state, player, move.card, rng);
      }
    }
  },

  getPlayerView(state, player): ShelemView {
    const seat = state.players.indexOf(player);
    const isHakem = state.hakemIndex === seat;

    // Zamin visibility: reveal → everyone (bidding & exchange); private → only
    // the Hakem during the exchange. Never leaked once play begins.
    let zamin: Card[] = [];
    if (state.options.zaminReveal === "reveal" && (state.phase === "bidding" || state.phase === "zaminExchange")) {
      zamin = state.zamin;
    } else if (state.phase === "zaminExchange" && isHakem) {
      zamin = state.zamin;
    }

    // During the exchange the Hakem holds the 16 they choose from.
    const hand = state.phase === "zaminExchange" && isHakem ? hakemHolding(state) : (state.hands[player] ?? []);

    const aceValue = state.options.aceValue;
    const teamPoints = [0, 1].map(
      t => cardPointsOf(state.capturedTeam[t] ?? [], aceValue) + (state.tricksWonTeam[t] ?? 0) * 5,
    );

    return {
      forPlayer: player,
      phase: state.phase,
      currentTurn: state.currentTurn,
      players: state.players,
      dealerIndex: state.dealerIndex,
      teamMap: state.teamMap,
      hand,
      handSizes: state.players.map(p => (state.hands[p] ?? []).length),
      zamin,
      currentBidder: state.currentBidder,
      highBid: state.highBid,
      highBidder: state.highBidder,
      isShelemBid: state.isShelemBid,
      passed: state.passed,
      hakemIndex: state.hakemIndex,
      contractBid: state.contractBid,
      contractIsShelem: state.contractIsShelem,
      trumpSuit: state.trumpSuit,
      currentTrick: state.currentTrick,
      trickLeaderIndex: state.trickLeaderIndex,
      capturedCounts: [state.capturedTeam[0].length, state.capturedTeam[1].length],
      tricksWonTeam: state.tricksWonTeam,
      teamPoints,
      scores: state.scores,
      roundNumber: state.roundNumber,
      targetScore: state.targetScore,
      options: state.options,
    };
  },

  getOutcome(state) {
    if (state.phase !== "gameOver") return null;
    const winnerTeam = state.scores[0] === state.scores[1]
      ? (state.hakemIndex !== null ? state.teamMap[state.players[state.hakemIndex]] : 0)
      : state.scores[0] > state.scores[1] ? 0 : 1;
    return {
      winners: state.players.filter((_, i) => i % 2 === winnerTeam),
      scores: { team0: state.scores[0], team1: state.scores[1] },
    };
  },

  getDefaultMove(state, player) {
    if (state.phase === "bidding") return { type: "pass" };
    if (state.phase === "zaminExchange") return shelemDiscardMove(state);
    const legal = legalPlays(state.hands[player] ?? [], state.currentTrick);
    return { type: "playCard", card: lowestCard(legal) };
  },

  getBotMove(state, player, rng) {
    if (state.phase === "bidding") return shelemBidMove(state, player);
    if (state.phase === "zaminExchange") return shelemDiscardMove(state);
    return shelemPlayMove(state, player, rng);
  },
};
