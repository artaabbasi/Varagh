import type { Card } from "@varagh/shared";
import styles from "./PlayingCard.module.css";

const SUIT_SYMBOL: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

export type SeatPosition = "bottom" | "top" | "left" | "right";

interface PlayingCardProps {
  card?: Card;
  faceUp?: boolean;
  disabled?: boolean;
  highlighted?: boolean;
  isTrump?: boolean;
  onClick?: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  style?: React.CSSProperties;
  className?: string;
  "aria-label"?: string;
  compact?: boolean;
  animateFrom?: SeatPosition;
  tabIndex?: number;
}

export function PlayingCard({
  card,
  faceUp = true,
  disabled = false,
  highlighted = false,
  isTrump = false,
  onClick,
  onKeyDown,
  style,
  className,
  "aria-label": ariaLabel,
  compact = false,
  animateFrom,
  tabIndex,
}: PlayingCardProps) {
  const base = [
    styles.card,
    compact ? styles.compact : null,
    animateFrom ? styles[`from_${animateFrom}`] : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (!card || !faceUp) {
    return <div className={`${base} ${styles.back}`} style={style} aria-hidden="true" />;
  }

  const isRed = card.suit === "hearts" || card.suit === "diamonds";
  const symbol = SUIT_SYMBOL[card.suit];
  const label = ariaLabel ?? `${card.rank} of ${card.suit}`;

  const faceClass = [
    styles.face,
    isRed ? styles.red : styles.black,
    highlighted ? styles.highlighted : null,
    isTrump && !highlighted ? styles.trump : null,
    disabled ? styles.disabled : null,
    onClick ? styles.interactive : null,
  ]
    .filter(Boolean)
    .join(" ");

  if (onClick) {
    return (
      <button
        type="button"
        className={`${base} ${faceClass}`}
        style={style}
        onClick={onClick}
        onKeyDown={onKeyDown}
        aria-label={label}
        tabIndex={tabIndex}
        aria-disabled={disabled}
      >
        <span className={styles.corner} aria-hidden="true">
          <span className={styles.rank}>{card.rank}</span>
          <span className={styles.suitSmall}>{symbol}</span>
        </span>
        <span className={styles.centerSuit} aria-hidden="true">
          {symbol}
        </span>
        <span className={`${styles.corner} ${styles.cornerBr}`} aria-hidden="true">
          <span className={styles.rank}>{card.rank}</span>
          <span className={styles.suitSmall}>{symbol}</span>
        </span>
      </button>
    );
  }

  return (
    <div
      className={`${base} ${faceClass}`}
      style={style}
      aria-label={label}
      role="img"
    >
      <span className={styles.corner} aria-hidden="true">
        <span className={styles.rank}>{card.rank}</span>
        <span className={styles.suitSmall}>{symbol}</span>
      </span>
      <span className={styles.centerSuit} aria-hidden="true">
        {symbol}
      </span>
      <span className={`${styles.corner} ${styles.cornerBr}`} aria-hidden="true">
        <span className={styles.rank}>{card.rank}</span>
        <span className={styles.suitSmall}>{symbol}</span>
      </span>
    </div>
  );
}
