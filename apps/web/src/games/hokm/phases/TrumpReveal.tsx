import { useTranslation } from "react-i18next";
import styles from "./TrumpReveal.module.css";

const SUIT_SYMBOL: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

interface TrumpRevealProps {
  /** The chosen trump suit, or null when nothing is being announced. */
  suit: string | null;
  /** Hakem's display name, shown as "{name} chose the trump". */
  hakemName?: string;
}

/**
 * A short, celebratory announcement of the chosen trump suit. Mounted while
 * `suit` is non-null; HokmGame clears it on a timer so it auto-dismisses.
 */
export function TrumpReveal({ suit, hakemName }: TrumpRevealProps) {
  const { t } = useTranslation();
  if (!suit) return null;

  const isRed = suit === "hearts" || suit === "diamonds";

  return (
    <div className={styles.overlay} role="status" aria-live="polite">
      <div className={styles.card}>
        <span className={styles.label}>{t("hokm.trump")}</span>
        <span className={[styles.suit, isRed ? styles.red : styles.black].join(" ")}>
          {SUIT_SYMBOL[suit]}
        </span>
        <span className={styles.name}>{t(`hokm.suits.${suit}`)}</span>
        {hakemName && (
          <span className={styles.by}>{t("hokm.trumpChosenBy", { name: hakemName })}</span>
        )}
      </div>
    </div>
  );
}
