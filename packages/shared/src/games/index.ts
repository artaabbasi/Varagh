import type { GameDefinition } from "../engine/game-engine";
import { hokm } from "./hokm/index";
import { pasur } from "./pasur/index";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const games: GameDefinition<any, any, any>[] = [
  hokm,
  pasur,
  // shelem,  <- future games slot in like this
];

// UI utilities — re-exported so the web app doesn't need deep imports
export type { HokmView, HokmMove, HokmPhase, TrickPlay } from "./hokm/state";
export { legalPlays, SUITS, isLegalPlay, sortHand } from "./hokm/rules";

export type { PasurView, PasurMove, PasurPhase, PasurOptions } from "./pasur/state";
export {
  captureOptionsFor,
  numeralValue,
  isNumeral,
  sameCard as pasurSameCard,
  sameCardSet,
  cardKey as pasurCardKey,
} from "./pasur/rules";
