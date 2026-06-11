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

// ── Module-level helpers ───────────────────────────────────────────────────

function moveEquals(a: HokmMove, b: HokmMove): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "chooseTrump" && b.type === "chooseTrump") return a.suit === b.suit;
  if (a.type === "playCard" && b.type === "playCard")
    return a.card.suit === b.card.suit && a.card.rank === b.card.rank;
  return false;
}

/**
 * Build the teamMap for the given players and hakemIndex.
 * 4p: slot determined by seat parity (i % 2) — fixed across hands.
 * 3p: hakem → slot 0, both opponents → slot 1 — rebuilt each hand.
 */
function buildTeamMap(players: PlayerId[], hakemIndex: number): Record<PlayerId, 0 | 1> {
  const map: Record<PlayerId, 0 | 1> = {};
  if (players.length === 4) {
    for (let i = 0; i < players.length; i++) {
      map[players[i]] = (i % 2) as 0 | 1;
    }
  } else {
    for (let i = 0; i < players.length; i++) {
      map[players[i]] = i === hakemIndex ? 0 : 1;
    }
  }
  return map;
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
  // 4p → 13 cards each; 3p → 17 cards each
  const targetHandSize = n === 3 ? 17 : 13;

  for (const p of state.players) newHands[p] = [...state.hands[p]];

  // Fill non-hakem players first (in deal order), then hakem gets the remainder.
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
  const winnerId = trickWinner(newTrick, state.trump!);
  const winnerSlot = state.teamMap[winnerId];      // 0 or 1
  const winnerIdx = state.players.indexOf(winnerId);
  const newTricksTaken: [number, number] = [state.tricksTaken[0], state.tricksTaken[1]];
  newTricksTaken[winnerSlot]++;

  events.push({
    type: "trickWon",
    data: { winnerId, trick: newTrick },
    visibility: { kind: "public" },
  });

  // Hand not over yet
  if (newTricksTaken[0] < 7 && newTricksTaken[1] < 7) {
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
  // hakemSlot is always 0 in 3p; in 4p it equals hakemIndex % 2.
  const hakemSlot = state.teamMap[state.players[state.hakemIndex]];
  const score = scoreHand(newTricksTaken, hakemSlot);

  // Score update is variant-specific:
  // 4p — per-team scores (length-2 array, indexed by slot)
  // 3p — per-player scores (length-3 array); opponents always score equally
  let newScores: number[];
  if (state.players.length === 3) {
    newScores = [...state.scores];
    const pts = score.pointsGained[score.winnerTeam];
    if (score.winnerTeam === 0) {
      // Hakem's slot won → award the hakem player
      newScores[state.hakemIndex] += pts;
    } else {
      // Opponents' slot won → award every non-hakem player
      for (let i = 0; i < state.players.length; i++) {
        if (i !== state.hakemIndex) newScores[i] += pts;
      }
    }
  } else {
    newScores = [
      state.scores[0] + score.pointsGained[0],
      state.scores[1] + score.pointsGained[1],
    ];
  }

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
  const hakemTeamWon = newTricksTaken[hakemSlot] >= 7;
  const newHakemIndex = hakemTeamWon
    ? state.hakemIndex
    : (state.hakemIndex - 1 + state.players.length) % state.players.length;

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
      tricksTaken: [0, 0],
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
  variants: [variant4p, variant3p],

  setup(ctx) {
    const { players, rng } = ctx;
    const targetScore = (ctx.options.targetScore as number | undefined) ?? 7;
    const is3p = players.length === 3;
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
      tricksTaken: [0, 0],
      teamMap: buildTeamMap(players, hakemIndex),
      scores: is3p ? players.map(() => 0) : [0, 0],
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

    if (move.type === "chooseTrump") return applyChooseTrump(state, move.suit);
    return applyPlayCard(state, player, move.card, rng);
  },

  getPlayerView(state, player): HokmView {
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
    };
  },

  getOutcome(state) {
    if (state.phase !== "gameOver") return null;

    if (state.players.length === 3) {
      const maxScore = Math.max(...state.scores);
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
    const legal = legalPlays(state.hands[player] ?? [], state.currentTrick);
    return { type: "playCard", card: lowestCard(legal) };
  },
};
