import { randomInt } from "crypto";

// No 0/O, 1/I to avoid visual ambiguity
const CHARS = "BCDEFGHJKLMNPQRSTUVWXYZ";

export function generateJoinCode(): string {
  return Array.from({ length: 6 }, () => CHARS[randomInt(CHARS.length)]).join("");
}
