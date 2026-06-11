import type { VariantDefinition } from "../../../engine/game-engine";

export const variant2p: VariantDefinition = {
  id: "hokm-2p",
  name: { en: "2-Player Hokm", fa: "حکم دو نفره" },
  minPlayers: 2,
  maxPlayers: 2,
  hasTeams: false,
  options: [
    {
      key: "targetScore",
      name: { en: "Target score", fa: "امتیاز هدف" },
      type: "number",
      default: 7,
    },
  ],
};
