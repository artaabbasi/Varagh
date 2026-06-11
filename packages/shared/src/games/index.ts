import type { GameDefinition } from "../engine/game-engine";
import { hokm } from "./hokm/index";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const games: GameDefinition<any, any, any>[] = [
  hokm,
  // shelem,  <- future games slot in like this
];

// UI utilities — re-exported so the web app doesn't need deep imports
export type { HokmView, HokmMove, HokmPhase, TrickPlay } from "./hokm/state";
export { legalPlays, SUITS, isLegalPlay } from "./hokm/rules";
