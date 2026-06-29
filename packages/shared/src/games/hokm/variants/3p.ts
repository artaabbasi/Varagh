import type { VariantDefinition } from "../../../engine/game-engine";

export const variant3p: VariantDefinition = {
  id: "hokm-3p",
  name: { en: "3-Player Hokm", fa: "حکم سه نفره" },
  minPlayers: 3,
  maxPlayers: 3,
  hasTeams: false,
  options: [
    {
      key: "targetScore",
      name: { en: "Target score", fa: "امتیاز هدف" },
      type: "number",
      default: 7,
      min: 1,
      max: 13,
    },
  ],
};
