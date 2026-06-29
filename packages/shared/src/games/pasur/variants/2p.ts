import type { VariantDefinition } from "../../../engine/game-engine";

export const variant2p: VariantDefinition = {
  id: "pasur-2p",
  name: { en: "2-Player Pasur", fa: "پاسور دو نفره" },
  minPlayers: 2,
  maxPlayers: 2,
  hasTeams: false,
  // All toggles default OFF. The options shape is intentionally extensible —
  // future Pasur options slot in here and flow through setup(ctx).options.
  options: [
    {
      key: "targetScore",
      name: { en: "Target score", fa: "امتیاز برد" },
      type: "number",
      default: 62,
      min: 11,
      max: 200,
    },
    {
      key: "surDisabledAt50",
      name: { en: "No Sur at 50+ points", fa: "بدون سور در ۵۰+ امتیاز" },
      type: "boolean",
      default: false,
    },
    {
      key: "surTitForTat",
      name: { en: "Net Surs only (tit-for-tat)", fa: "فقط سورِ خالص (تلافی)" },
      type: "boolean",
      default: false,
    },
    {
      key: "multiCapture",
      name: { en: "Capture all combinations", fa: "برداشت همه‌ی ترکیب‌ها" },
      type: "boolean",
      default: false,
    },
  ],
};
