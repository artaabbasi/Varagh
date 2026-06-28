/**
 * Chat stickers — short, expressive reactions players can send each other from
 * an in-game wheel. Stickers are deliberately content-free with respect to the
 * game: they convey mood (competitive / kind / friendly), never information
 * that could be used to coordinate or cheat (no suits, ranks, "I have…", etc.).
 *
 * The catalogue lives in shared so the server can validate incoming sticker ids
 * and the web client can render matching art for each id.
 */

export type StickerTone = "competitive" | "kind" | "friendly";

export interface StickerDef {
  id: string;
  tone: StickerTone;
  /** Localized short label shown under the art and used as the aria-label. */
  label: Record<"en" | "fa", string>;
}

export const STICKERS: readonly StickerDef[] = [
  // ── Competitive ──────────────────────────────────────────────
  { id: "gg",        tone: "competitive", label: { en: "GG!",          fa: "خسته نباشی!" } },
  { id: "bring-it",  tone: "competitive", label: { en: "Bring it on!", fa: "بزن بریم!" } },
  { id: "fire",      tone: "competitive", label: { en: "On fire!",     fa: "داغ شد!" } },
  // ── Kind ─────────────────────────────────────────────────────
  { id: "nice",      tone: "kind",        label: { en: "Nice play!",   fa: "آفرین!" } },
  { id: "good-luck", tone: "kind",        label: { en: "Good luck!",   fa: "موفق باشی!" } },
  { id: "thanks",    tone: "kind",        label: { en: "Thank you!",   fa: "ممنون!" } },
  // ── Friendly ─────────────────────────────────────────────────
  { id: "hello",     tone: "friendly",    label: { en: "Hello!",       fa: "سلام!" } },
  { id: "haha",      tone: "friendly",    label: { en: "Haha!",        fa: "هاها!" } },
  { id: "thumbs-up", tone: "friendly",    label: { en: "Nice!",        fa: "ایول!" } },
] as const;

export const STICKER_IDS: readonly string[] = STICKERS.map((s) => s.id);

export function isStickerId(id: unknown): id is string {
  return typeof id === "string" && STICKER_IDS.includes(id);
}

/** Minimum gap between a single player's sticker sends, enforced server-side. */
export const STICKER_COOLDOWN_MS = 3000;
