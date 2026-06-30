import type { GameDefinition } from "../engine/game-engine";
import { hokm } from "./hokm/index";
import { pasur } from "./pasur/index";
import { shelem } from "./shelem/index";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const games: GameDefinition<any, any, any>[] = [
  hokm,
  pasur,
  shelem,
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

export type { ShelemView, ShelemMove, ShelemPhase, ShelemOptions } from "./shelem/state";
export {
  SUITS as SHELEM_SUITS,
  legalPlays as shelemLegalPlays,
  isLegalPlay as shelemIsLegalPlay,
  sortHand as shelemSortHand,
  cardPointsOf as shelemCardPoints,
  roundTotalPoints as shelemRoundTotal,
  maxNumericBid as shelemMaxBid,
  numericBidOptions as shelemBidOptions,
  sameCard as shelemSameCard,
  sameCardSet as shelemSameCardSet,
  BID_STEP as SHELEM_BID_STEP,
} from "./shelem/rules";
