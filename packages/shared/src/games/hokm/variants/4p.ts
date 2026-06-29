import type { VariantDefinition } from "../../../engine/game-engine";

export const variant4p: VariantDefinition = {
  id: "hokm-4p",
  name: { en: "4-Player Hokm", fa: "حکم چهار نفره" },
  minPlayers: 4,
  maxPlayers: 4,
  hasTeams: true,
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
