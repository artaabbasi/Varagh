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
import type { HokmMove, HokmState, HokmView } from "./state";
import {
  createDeck,
  createDeck3p,
  handOverEvents,
  legalPlays,
  lowestCard,
  mostCommonSuit,
  scoreHand,
  SUITS,
  trickWinner,
} from "./rules";
import { variant4p } from "./variants/4p";
import { variant3p } from "./variants/3p";
import { variant2p } from "./variants/2p";

// ── Module-level helpers ───────────────────────────────────────────────────

function moveEquals(a: HokmMove, b: HokmMove): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "chooseTrump" && b.type === "chooseTrump") return a.suit === b.suit;
  if (a.type === "playCard" && b.type === "playCard")
    return a.card.suit === b.card.suit && a.card.rank === b.card.rank;
  // keepCard / rejectCard: type equality is sufficient (no payload)
  return true;
}

/**
 * Build the teamMap (player → tricks/score slot). Fixed across hands.
 * 4p: seat parity (i % 2) — partners {0,2} and {1,3} share a slot.
 * 2p/3p: the seat index itself — every player is their own slot (heads-up /
 *        3p free-for-all: no teams, each player scores their own tricks).
 */
function buildTeamMap(players: PlayerId[], _hakemIndex: number): Record<PlayerId, number> {
  const map: Record<PlayerId, number> = {};
  const fourPlayer = players.length === 4;
  for (let i = 0; i < players.length; i++) {
    map[players[i]] = fourPlayer ? i % 2 : i;
  }
  return map;
}

/** Initial all-zero trick/score slots: 2 slots for 4p teams & 2p seats, 3 for 3p seats. */
function zeroSlots(players: PlayerId[]): number[] {
  return players.length === 4 ? [0, 0] : players.map(() => 0);
}

/**
 * Deal 5 cards to the Hakem from a shuffled copy of `deck`; the rest goes to deckForDeal.
 * The caller passes an unshuffled deck; shuffle happens here so the RNG is consumed in order.
 */
function dealHand(
  players: PlayerId[],
  hakemIndex: number,
  rng: Rng,
  deck: Card[]
): Pick<HokmState, "hands" | "deckForDeal"> {
  const shuffled = rng.shuffle(deck);
  const hakemId = players[hakemIndex];
  const hands: Record<PlayerId, Card[]> = {};
  for (const p of players) hands[p] = [];
  hands[hakemId] = shuffled.slice(0, 5);
  return { hands, deckForDeal: shuffled.slice(5) };
}

function blankHands(players: PlayerId[]): Record<PlayerId, Card[]> {
  return Object.fromEntries(players.map(p => [p, []]));
}

function removeOneCard(hand: Card[], card: Card): Card[] {
  let removed = false;
  return hand.filter(c => {
    if (!removed && c.suit === card.suit && c.rank === card.rank) {
      removed = true;
      return false;
    }
    return true;
  });
}

function err(code: MoveError["code"], en: string, fa: string): MoveResult<HokmState> {
  return { ok: false, error: { code, message: { en, fa } } };
}

// ── apply sub-functions ────────────────────────────────────────────────────

function applyChooseTrump(state: HokmState, suit: Suit): MoveResult<HokmState> {
  const deck = [...state.deckForDeal];
  const newHands: Record<PlayerId, Card[]> = {};
  const n = state.players.length;

  for (const p of state.players) newHands[p] = [...state.hands[p]];

  // 2p: deal exactly 5 to the opponent then keep the rest as the draw stock.
  if (n === 2) {
    const opponentIdx = (state.hakemIndex + 1) % 2;
    const opponent = state.players[opponentIdx];
    newHands[opponent] = [...newHands[opponent], ...deck.splice(0, 5)];
    // deck now has 42 cards = the face-down stock
    const events: GameEvent[] = [
      { type: "trumpChosen", data: { suit }, visibility: { kind: "public" } },
    ];
    if (deck.length > 0) {
      // Hakem sees the top card of the stock at the start of their first draw turn
      events.push({
        type: "stockCardSeen",
        data: { card: deck[0] },
        visibility: { kind: "private", id: state.players[state.hakemIndex] },
      });
    }
    return {
      ok: true,
      state: {
        ...state,
        phase: "drawing",
        trump: suit,
        hands: newHands,
        deckForDeal: deck,
        currentTurn: state.players[state.hakemIndex], // hakem draws first
      },
      events,
    };
  }

  // 3p/4p: fill all players to their target hand size, then go straight to playing.
  const targetHandSize = n === 3 ? 17 : 13;
  for (let i = 1; i < n; i++) {
    const p = state.players[(state.hakemIndex + i) % n];
    newHands[p] = [...newHands[p], ...deck.splice(0, targetHandSize - newHands[p].length)];
  }
  newHands[state.players[state.hakemIndex]] = [
    ...newHands[state.players[state.hakemIndex]],
    ...deck,
  ];

  return {
    ok: true,
    state: {
      ...state,
      phase: "playing",
      trump: suit,
      hands: newHands,
      deckForDeal: [],
      currentTurn: state.players[state.trickLeaderIndex],
    },
    events: [
      { type: "trumpChosen", data: { suit }, visibility: { kind: "public" } },
    ],
  };
}

/**
 * Apply a single draw-phase move (keepCard / rejectCard).
 *
 * Stock layout: [seenCard, pairedCard, ...rest]
 * - keepCard:   player keeps seenCard,  pairedCard becomes dead.
 * - rejectCard: seenCard becomes dead,  player keeps pairedCard.
 * Either way: 2 cards leave the stock, 1 enters the player's hand.
 *
 * Drawing terminates when every player has 13 cards. The remaining stock
 * (≈10 cards) is discarded face-down and never revealed.
 */
function applyDrawCard(
  state: HokmState,
  player: PlayerId,
  keep: boolean
): MoveResult<HokmState> {
  const stock = [...state.deckForDeal];
  const seenCard  = stock[0];  // card the active player is looking at
  const pairedCard = stock[1]; // companion card, not looked at by anyone
  const newStock  = stock.slice(2);

  const keptCard = keep ? seenCard : pairedCard;
  const newHand  = [...state.hands[player], keptCard];
  const newHands = { ...state.hands, [player]: newHand };

  const events: GameEvent[] = [
    // Public: opponent knows the move TYPE was made (keep or reject), not the card.
    {
      type: "drawAction",
      data: { playerId: player, action: keep ? "kept" : "rejected" },
      visibility: { kind: "public" },
    },
    // Private: active player learns which card they actually received.
    {
      type: "cardDrawn",
      data: { card: keptCard },
      visibility: { kind: "private", id: player },
    },
  ];

  // Drawing ends when all players have 13 cards.
  const drawingComplete = state.players.every(p =>
    p === player
      ? newHand.length >= 13
      : (state.hands[p] ?? []).length >= 13
  );

  if (drawingComplete) {
    return {
      ok: true,
      state: {
        ...state,
        phase: "playing",
        hands: newHands,
        deckForDeal: [],   // remaining stock is discarded face-down
        currentTurn: state.players[state.trickLeaderIndex],
      },
      events: [
        ...events,
        { type: "drawingComplete", data: {}, visibility: { kind: "public" } },
      ],
    };
  }

  // Next player's draw turn — emit a private "peek" for them.
  const playerIdx = state.players.indexOf(player);
  const nextIdx   = (playerIdx + 1) % state.players.length;
  const nextPlayer = state.players[nextIdx];

  if (newStock.length > 0) {
    events.push({
      type: "stockCardSeen",
      data: { card: newStock[0] },
      visibility: { kind: "private", id: nextPlayer },
    });
  }

  return {
    ok: true,
    state: {
      ...state,
      hands: newHands,
      deckForDeal: newStock,
      currentTurn: nextPlayer,
    },
    events,
  };
}

function applyPlayCard(
  state: HokmState,
  player: PlayerId,
  card: Card,
  rng: Rng
): MoveResult<HokmState> {
  const playerIdx = state.players.indexOf(player);
  const newHands = { ...state.hands, [player]: removeOneCard(state.hands[player], card) };
  const newTrick = [...state.currentTrick, { playerId: player, card }];

  const events: GameEvent[] = [
    { type: "cardPlayed", data: { playerId: player, card }, visibility: { kind: "public" } },
  ];

  // Trick still in progress — advance turn
  if (newTrick.length < state.players.length) {
    const nextIdx = (playerIdx + 1) % state.players.length;
    return {
      ok: true,
      state: { ...state, hands: newHands, currentTrick: newTrick, currentTurn: state.players[nextIdx] },
      events,
    };
  }

  // ── Trick complete ───────────────────────────────────────────
  const winnerId   = trickWinner(newTrick, state.trump!);
  const winnerSlot = state.teamMap[winnerId];
  const winnerIdx  = state.players.indexOf(winnerId);
  const newTricksTaken = [...state.tricksTaken];
  newTricksTaken[winnerSlot]++;

  events.push({
    type: "trickWon",
    data: { winnerId, trick: newTrick },
    visibility: { kind: "public" },
  });

  // The hand ends when a side reaches 7 tricks, or (3p only) when every card
  // has been played without anyone reaching 7 (e.g. a 6-6-5 split).
  const reachedTarget = newTricksTaken.some(t => t >= 7);
  const cardsExhausted = state.players.every(p => (newHands[p] ?? []).length === 0);

  // Hand not over yet
  if (!reachedTarget && !cardsExhausted) {
    return {
      ok: true,
      state: {
        ...state,
        hands: newHands,
        currentTrick: [],
        trickLeaderIndex: winnerIdx,
        currentTurn: winnerId,
        tricksTaken: newTricksTaken,
      },
      events,
    };
  }

  // ── Hand over ────────────────────────────────────────────────
  const hakemSlot = state.teamMap[state.players[state.hakemIndex]];
  const score     = scoreHand(newTricksTaken, hakemSlot);

  // Slot indexing is now uniform across variants: `scores` and `tricksTaken`
  // share the same slots (teams for 4p, seats for 2p/3p), so the winning slot
  // is simply credited its points — no per-variant special-casing.
  const newScores = [...state.scores];
  newScores[score.winnerSlot] += score.points;

  events.push(...handOverEvents(newTricksTaken, newScores, score));

  // ── Game over? ───────────────────────────────────────────────
  if (newScores.some(s => s >= state.targetScore)) {
    const winnerSeat = newScores.findIndex(s => s >= state.targetScore);
    events.push({
      type: "gameOver",
      data: { winnerSeat, scores: newScores },
      visibility: { kind: "public" },
    });
    return {
      ok: true,
      state: {
        ...state,
        phase: "gameOver",
        hands: blankHands(state.players),
        currentTrick: [],
        currentTurn: null,
        tricksTaken: newTricksTaken,
        scores: newScores,
      },
      events,
    };
  }

  // ── Next hand ────────────────────────────────────────────────
  // The Hakem keeps the seat while their side wins; on a loss it passes to the
  // next player in PLAY order (seat + 1), so trump rotation and turn rotation
  // always run in the same direction.
  const hakemKeepsSeat = score.winnerSlot === hakemSlot;
  const newHakemIndex = hakemKeepsSeat
    ? state.hakemIndex
    : (state.hakemIndex + 1) % state.players.length;

  const freshDeckCards = state.players.length === 3 ? createDeck3p() : createDeck();
  const { hands: freshHands, deckForDeal: freshDeck } = dealHand(
    state.players, newHakemIndex, rng, freshDeckCards
  );

  return {
    ok: true,
    state: {
      ...state,
      phase: "choosingTrump",
      hakemIndex: newHakemIndex,
      trump: null,
      hands: freshHands,
      deckForDeal: freshDeck,
      currentTrick: [],
      trickLeaderIndex: newHakemIndex,
      currentTurn: state.players[newHakemIndex],
      tricksTaken: zeroSlots(state.players),
      teamMap: buildTeamMap(state.players, newHakemIndex),
      scores: newScores,
      handNumber: state.handNumber + 1,
    },
    events,
  };
}

// ── GameDefinition ─────────────────────────────────────────────────────────

export const hokm: GameDefinition<HokmState, HokmMove, HokmView> = {
  id: "hokm",
  name: { en: "Hokm", fa: "حکم" },
  variants: [variant4p, variant3p, variant2p],

  setup(ctx) {
    const { players, rng } = ctx;
    const targetScore = (ctx.options.targetScore as number | undefined) ?? 7;
    const is3p = players.length === 3;
    // 2p and 4p both use the full 52-card deck; 3p uses the 51-card deck.
    const baseDeck = is3p ? createDeck3p() : createDeck();

    // Determine Hakem: deal cards one at a time until the first ace.
    const probe = rng.shuffle(baseDeck);
    let hakemIndex = 0;
    for (let i = 0; i < probe.length; i++) {
      if (probe[i].rank === "A") {
        hakemIndex = i % players.length;
        break;
      }
    }

    const { hands, deckForDeal } = dealHand(players, hakemIndex, rng, baseDeck);

    return {
      phase: "choosingTrump",
      players,
      hakemIndex,
      trump: null,
      hands,
      deckForDeal,
      currentTrick: [],
      trickLeaderIndex: hakemIndex,
      currentTurn: players[hakemIndex],
      tricksTaken: zeroSlots(players),
      teamMap: buildTeamMap(players, hakemIndex),
      // 4p: per-team scores [0,0]; 2p/3p: per-seat scores
      scores: zeroSlots(players),
      handNumber: 0,
      targetScore,
    };
  },

  getValidMoves(state, player) {
    if (state.currentTurn !== player) return [];

    if (state.phase === "choosingTrump") {
      if (state.players[state.hakemIndex] !== player) return [];
      return SUITS.map(suit => ({ type: "chooseTrump" as const, suit }));
    }

    if (state.phase === "drawing") {
      // Stock must have at least 2 cards for either draw move to be possible.
      if (state.deckForDeal.length < 2) return [];
      return [{ type: "keepCard" as const }, { type: "rejectCard" as const }];
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
      return err("WRONG_PHASE", "Game is over.", "بازی تمام شده است.");

    if (state.currentTurn !== player)
      return err("NOT_YOUR_TURN", "It is not your turn.", "نوبت شما نیست.");

    const valid = this.getValidMoves(state, player);
    if (!valid.some(m => moveEquals(m, move))) {
      if (move.type === "playCard") {
        const inHand = (state.hands[player] ?? []).some(
          c => c.suit === move.card.suit && c.rank === move.card.rank
        );
        if (!inHand)
          return err("INVALID_MOVE", "That card is not in your hand.", "این کارت در دست شما نیست.");
        return err("RULE_VIOLATION", "You must follow suit.", "باید همرنگ بیاورید.");
      }
      return err("INVALID_MOVE", "That move is not legal right now.", "این حرکت مجاز نیست.");
    }

    switch (move.type) {
      case "chooseTrump":  return applyChooseTrump(state, move.suit);
      case "keepCard":     return applyDrawCard(state, player, true);
      case "rejectCard":   return applyDrawCard(state, player, false);
      case "playCard":     return applyPlayCard(state, player, move.card, rng);
    }
  },

  getPlayerView(state, player): HokmView {
    const isDrawing = state.phase === "drawing";
    // The active player sees the top card of the stock; the inactive player does not.
    const seenCard =
      isDrawing && state.currentTurn === player && state.deckForDeal.length > 0
        ? state.deckForDeal[0]
        : null;

    return {
      forPlayer: player,
      phase: state.phase,
      currentTurn: state.currentTurn,
      players: state.players,
      hakemIndex: state.hakemIndex,
      trump: state.trump,
      hand: state.hands[player] ?? [],
      handSizes: state.players.map(p => (state.hands[p] ?? []).length),
      currentTrick: state.currentTrick,
      trickLeaderIndex: state.trickLeaderIndex,
      tricksTaken: state.tricksTaken,
      scores: state.scores,
      handNumber: state.handNumber,
      seenCard,
      stockCount: isDrawing ? state.deckForDeal.length : 0,
    };
  },

  getOutcome(state) {
    if (state.phase !== "gameOver") return null;

    // 2p and 3p: per-player winner
    if (state.players.length !== 4) {
      const maxScore  = Math.max(...state.scores);
      const winnerIdx = state.scores.indexOf(maxScore);
      return {
        winners: [state.players[winnerIdx]],
        scores: Object.fromEntries(state.players.map((p, i) => [p, state.scores[i]])),
      };
    }

    // 4p: team-based outcome
    const winnerTeam = state.scores[0] > state.scores[1] ? 0 : 1;
    return {
      winners: state.players.filter((_, i) => i % 2 === winnerTeam),
      scores: { team0: state.scores[0], team1: state.scores[1] },
    };
  },

  getDefaultMove(state, player) {
    if (state.phase === "choosingTrump")
      return { type: "chooseTrump", suit: mostCommonSuit(state.hands[player] ?? []) };
    if (state.phase === "drawing")
      return { type: "keepCard" };
    const legal = legalPlays(state.hands[player] ?? [], state.currentTrick);
    return { type: "playCard", card: lowestCard(legal) };
  },
};
