import { useCallback, useEffect, useRef, useState } from "react";
import type { Card } from "@varagh/shared";
import { PlayingCard } from "./PlayingCard";
import styles from "./HandFan.module.css";

function cardKey(c: Card) {
  return `${c.rank}_${c.suit}`;
}

function sameCard(a: Card, b: Card) {
  return a.rank === b.rank && a.suit === b.suit;
}

interface HandFanProps {
  cards: Card[];
  faceUp?: boolean;
  validCards?: Card[];
  trump?: string | null;
  onPlay?: (card: Card) => void;
  onInvalidPlay?: (card: Card) => void;
  compact?: boolean;
  className?: string;
}

export function HandFan({
  cards,
  faceUp = true,
  validCards,
  trump,
  onPlay,
  onInvalidPlay,
  compact = false,
  className,
}: HandFanProps) {
  const [shakingCard, setShakingCard] = useState<string | null>(null);
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fanRef = useRef<HTMLDivElement>(null);

  // Dynamically tighten card overlap so the fan always fits its container.
  // Without this, 13 cards at the default 30px-visible-per-card = 412px which
  // overflows a 375px phone screen.
  useEffect(() => {
    if (!faceUp) return;
    const el = fanRef.current;
    if (!el) return;
    const CARD_W = 52;
    const update = () => {
      const n = cards.length;
      if (n <= 1) { el.style.removeProperty("--card-margin"); return; }
      const w = el.getBoundingClientRect().width;
      if (w === 0) return;
      // How many px of each card should peek out from behind the next?
      const visible = Math.max(10, Math.min(30, (w - CARD_W) / (n - 1)));
      el.style.setProperty("--card-margin", `-${(CARD_W - visible).toFixed(1)}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [faceUp, cards.length]);

  const handlePlay = useCallback(
    (card: Card) => {
      if (!onPlay) return;
      const isValid = !validCards || validCards.some((v) => sameCard(v, card));
      if (!isValid) {
        const key = cardKey(card);
        setShakingCard(key);
        onInvalidPlay?.(card);
        if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
        shakeTimerRef.current = setTimeout(() => setShakingCard(null), 350);
        return;
      }
      onPlay(card);
    },
    [onPlay, onInvalidPlay, validCards],
  );

  if (!faceUp) {
    const displayCount = Math.min(cards.length, compact ? 4 : 5);
    return (
      <div
        className={[styles.fan, styles.faceDown, compact ? styles.compact : null, className]
          .filter(Boolean)
          .join(" ")}
        aria-label={`${cards.length} cards`}
      >
        {Array.from({ length: displayCount }).map((_, i) => (
          <PlayingCard
            key={i}
            faceUp={false}
            compact={compact}
            style={{ "--fan-i": i } as React.CSSProperties}
            className={styles.fanCard}
          />
        ))}
        {cards.length > displayCount && (
          <span className={styles.extraBadge}>+{cards.length - displayCount}</span>
        )}
      </div>
    );
  }

  const isMyTurn = Boolean(onPlay);

  return (
    <div
      ref={fanRef}
      className={[styles.fan, styles.faceUp, compact ? styles.compact : null, className]
        .filter(Boolean)
        .join(" ")}
      role="list"
      aria-label={`Your hand — ${cards.length} cards`}
    >
      {cards.map((card, i) => {
        const key = cardKey(card);
        const isPlayable = !validCards || validCards.some((v) => sameCard(v, card));
        const isShaking = shakingCard === key;
        const cardIsTrump = Boolean(trump && card.suit === trump);

        return (
          <div
            key={key}
            className={[styles.cardSlot, isShaking ? styles.shaking : null]
              .filter(Boolean)
              .join(" ")}
            style={
              {
                "--fan-i": i,
                "--fan-total": cards.length,
              } as React.CSSProperties
            }
            role="listitem"
          >
            <PlayingCard
              card={card}
              faceUp
              highlighted={isMyTurn && isPlayable}
              isTrump={cardIsTrump}
              disabled={isMyTurn && !isPlayable}
              onClick={isMyTurn ? () => handlePlay(card) : undefined}
              aria-label={`${card.rank} of ${card.suit}${isMyTurn && !isPlayable ? " — cannot play" : ""}`}
              tabIndex={isMyTurn && isPlayable ? 0 : -1}
            />
          </div>
        );
      })}
    </div>
  );
}
