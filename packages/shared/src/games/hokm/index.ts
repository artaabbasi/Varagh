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
  handOverEvents,
  legalPlays,
  lowestCard,
  mostCommonSuit,
  scoreHand,
  SUITS,
  teamOf,
  trickWinner,
} from "./rules";
import { variant4p } from "./variants/4p";

// ── Module-level helpers ───────────────────────────────────────────────────

function moveEquals(a: HokmMove, b: HokmMove): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "chooseTrump" && b.type === "chooseTrump") return a.suit === b.suit;
  if (a.type === "playCard" && b.type === "playCard")
    return a.card.suit === b.card.suit && a.card.rank === b.card.rank;
  return false;
}

function dealHand(
  players: PlayerId[],
  hakemIndex: number,
  rng: Rng
): Pick<HokmState, "hands" | "deckForDeal"> {
  const deck = rng.shuffle(createDeck());
  const hakemId = players[hakemIndex];
  const hands: Record<PlayerId, Card[]> = {};
  for (const p of players) hands[p] = [];
  hands[hakemId] = deck.slice(0, 5);
  return { hands, deckForDeal: deck.slice(5) };
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

  // Non-hakem players get filled to 13 first, hakem gets the remainder (8 cards)
  for (let i = 1; i < n; i++) {
    const p = state.players[(state.hakemIndex + i) % n];
    newHands[p] = [...newHands[p], ...deck.splice(0, 13 - newHands[p].length)];
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
  const winnerTeam = teamOf(state.players, winnerId);
  const winnerIdx = state.players.indexOf(winnerId);
  const newTricksTaken: [number, number] = [state.tricksTaken[0], state.tricksTaken[1]];
  newTricksTaken[winnerTeam]++;

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
  const hakemTeam = teamOf(state.players, state.players[state.hakemIndex]);
  const score = scoreHand(newTricksTaken, hakemTeam);
  const newScores: [number, number] = [
    state.scores[0] + score.pointsGained[0],
    state.scores[1] + score.pointsGained[1],
  ];
  events.push(...handOverEvents(newTricksTaken, newScores, score));

  // ── Game over? ───────────────────────────────────────────────
  if (newScores[0] >= state.targetScore || newScores[1] >= state.targetScore) {
    events.push({
      type: "gameOver",
      data: { winnerTeam: newScores[0] >= state.targetScore ? 0 : 1, scores: newScores },
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
  const hakemTeamWon = newTricksTaken[hakemTeam] >= 7;
  const newHakemIndex = hakemTeamWon
    ? state.hakemIndex
    : (state.hakemIndex - 1 + state.players.length) % state.players.length;

  const { hands: freshHands, deckForDeal: freshDeck } = dealHand(state.players, newHakemIndex, rng);

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
  variants: [variant4p],

  setup(ctx) {
    const { players, rng } = ctx;
    const targetScore = (ctx.options.targetScore as number | undefined) ?? 7;

    // Determine Hakem: deal cards one at a time until the first ace.
    const probe = rng.shuffle(createDeck());
    let hakemIndex = 0;
    for (let i = 0; i < probe.length; i++) {
      if (probe[i].rank === "A") {
        hakemIndex = i % players.length;
        break;
      }
    }

    const { hands, deckForDeal } = dealHand(players, hakemIndex, rng);

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
      scores: [0, 0],
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
