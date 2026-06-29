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
      min: 1,
      max: 13,
    },
    {
      // When on, the player who keeps/passes during the draw is privately shown
      // the card they burned. Heads-up only — no effect in 3p/4p.
      key: "revealBurned",
      name: { en: "Show burned cards", fa: "نمایش کارت‌های سوخته" },
      type: "boolean",
      default: false,
    },
  ],
};
