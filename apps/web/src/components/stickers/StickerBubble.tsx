import { useTranslation } from "react-i18next";
import { STICKERS } from "@varagh/shared";
import { StickerArt } from "./StickerArt";
import styles from "./StickerBubble.module.css";

interface StickerBubbleProps {
  stickerId: string;
  /**
   * Where the bubble sits relative to the avatar it belongs to:
   *  - "above": floats above the avatar with the tail pointing down (local player)
   *  - "below": hangs below the avatar with the tail pointing up (opponents up top)
   */
  placement?: "above" | "below";
}

/**
 * A chat-style speech bubble that pops from a player's avatar when they send a
 * sticker. The little tail points back at the avatar so it reads as coming
 * from that player. Remount it (via a changing React `key`) to replay the pop
 * on repeat sends; the parent controls how long it stays mounted.
 */
export function StickerBubble({ stickerId, placement = "above" }: StickerBubbleProps) {
  const { i18n } = useTranslation();
  const lang = (i18n.language as "fa" | "en") === "fa" ? "fa" : "en";
  const def = STICKERS.find((s) => s.id === stickerId);
  if (!def) return null;
  return (
    <div
      className={[styles.bubble, placement === "below" ? styles.below : styles.above].join(" ")}
      role="status"
      aria-live="polite"
    >
      <StickerArt id={stickerId} size={48} />
      <span className={styles.label}>{def.label[lang]}</span>
      <span className={styles.tail} aria-hidden="true" />
    </div>
  );
}
