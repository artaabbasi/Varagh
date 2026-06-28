import { useTranslation } from "react-i18next";
import { STICKERS } from "@varagh/shared";
import { StickerArt } from "./StickerArt";
import styles from "./StickerBubble.module.css";

interface StickerBubbleProps {
  stickerId: string;
}

/**
 * A floating sticker that pops over a player's seat when they send one.
 * Remount it (via a changing React `key`) to replay the pop animation on
 * repeat sends. Self-contained — the parent controls how long it stays mounted.
 */
export function StickerBubble({ stickerId }: StickerBubbleProps) {
  const { i18n } = useTranslation();
  const lang = (i18n.language as "fa" | "en") === "fa" ? "fa" : "en";
  const def = STICKERS.find((s) => s.id === stickerId);
  if (!def) return null;
  return (
    <div className={styles.bubble} role="status" aria-live="polite">
      <StickerArt id={stickerId} size={52} />
      <span className={styles.label}>{def.label[lang]}</span>
    </div>
  );
}
