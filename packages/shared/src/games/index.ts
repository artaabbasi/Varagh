import type { GameDefinition } from "../engine/game-engine";
import { hokm } from "./hokm/index";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const games: GameDefinition<any, any, any>[] = [
  hokm,
  // shelem,  <- future games slot in like this
];
