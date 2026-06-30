import type { VariantDefinition } from "../../../engine/game-engine";

export const variant4p: VariantDefinition = {
  id: "shelem-4p",
  name: { en: "4-Player Shelem", fa: "شلم چهار نفره" },
  minPlayers: 4,
  maxPlayers: 4,
  hasTeams: true,
  // Surfaced generically by the lobby create screen straight from this list.
  options: [
    {
      key: "targetScore",
      name: { en: "Target score", fa: "امتیاز هدف" },
      type: "number",
      default: 1165,
      min: 165,
      max: 2000,
    },
    {
      key: "failPenalty",
      name: { en: "Failed-contract penalty", fa: "جریمهٔ قرارداد ناموفق" },
      type: "choice",
      default: "simple",
      choices: ["simple", "doubled", "yasa"],
    },
    {
      key: "zaminReveal",
      name: { en: "Zamin reveal", fa: "نمایش زمین" },
      type: "choice",
      default: "private",
      choices: ["private", "reveal"],
    },
    {
      key: "shelemReward",
      name: { en: "Shelem (slam) reward", fa: "پاداش شلم" },
      type: "choice",
      default: "330",
      choices: ["330", "bidX2"],
    },
    {
      key: "aceValue",
      name: { en: "Ace value", fa: "ارزش آس" },
      type: "choice",
      default: 10,
      choices: [10, 15],
    },
    {
      key: "successScore",
      name: { en: "Successful-contract score", fa: "امتیاز قرارداد موفق" },
      type: "choice",
      default: "bidExact",
      choices: ["bidExact", "actual"],
    },
  ],
};
