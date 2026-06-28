import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { HokmView } from "@varagh/shared";
import type { Card } from "@varagh/shared";
import { sortHand } from "@varagh/shared";
import { HandFan } from "../../components/HandFan";
import { PlayerAvatar } from "../../components/PlayerAvatar";
import { TrickPile } from "../../components/TrickPile";
import { CountdownRing } from "../../components/CountdownRing";
import { StickerBubble } from "../../components/stickers/StickerBubble";
import { playSound } from "../../app/sound";
import styles from "./LocalHand.module.css";

const TURN_SECONDS = 30;

const SUIT_SYMBOL: Record<string, string> = {
  hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠",
};

interface LocalHandProps {
  view: HokmView;
  validCards: Card[];
  moveError: string | null;
  onPlay: (card: Card) => void;
  onClearError: () => void;
  trickCount: number;
  teamColor: "primary" | "tertiary" | "none";
  isHakem: boolean;
  avatarUrl?: string | null;
  /** Active sticker the local player just sent: `nonce` changes per send to replay the pop. */
  sticker?: { id: string; nonce: number } | null;
  className?: string;
}

export function LocalHand({
  view,
  validCards,
  moveError,
  onPlay,
  onClearError,
  trickCount,
  teamColor,
  isHakem,
  avatarUrl,
  sticker,
  className,
}: LocalHandProps) {
  const { t } = useTranslation();
  const isMyTurn = view.currentTurn === view.forPlayer && view.phase === "playing";

  const [remaining, setRemaining] = useState(TURN_SECONDS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [invalidCard, setInvalidCard] = useState<Card | null>(null);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!isMyTurn) { setRemaining(TURN_SECONDS); return; }

    setRemaining(TURN_SECONDS);
    intervalRef.current = setInterval(() => {
      setRemaining((s) => {
        const next = Math.max(0, s - 1);
        // Urgent tick over the final 5 seconds of your turn.
        if (next > 0 && next <= 5) playSound("turnTick");
        return next;
      });
    }, 1000);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isMyTurn]);

  const handleInvalidPlay = (card: Card) => {
    setInvalidCard(card);
    setTimeout(() => setInvalidCard(null), 400);
  };

  // Sort hand: trump suit first, then by suit/rank high-to-low
  const sortedHand = sortHand(view.hand, view.trump);

  const hasTrump = view.trump !== null && view.phase !== "choosingTrump";
  const isRed = view.trump === "hearts" || view.trump === "diamonds";

  return (
    <div
      className={[
        styles.localHand,
        isMyTurn ? styles.myTurn : null,
        teamColor !== "none" ? styles[`team_${teamColor}`] : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {sticker && <StickerBubble key={sticker.nonce} stickerId={sticker.id} />}

      {/* Player info row */}
      <div className={styles.playerRow}>
        <div className={styles.playerInfo}>
          <PlayerAvatar
            nickname={t("hokm.you")}
            isHakem={isHakem}
            teamColor={teamColor}
            avatarUrl={avatarUrl}
            compact
          />
          <TrickPile count={trickCount} teamColor={teamColor} />
        </div>

        <div className={styles.playerRowRight}>
          {/* Trump indicator — always visible once trump is known */}
          {hasTrump && view.trump && (
            <div className={styles.trumpStrip} aria-label={`${t("hokm.trump")}: ${t(`hokm.suits.${view.trump}`)}`}>
              <span className={styles.trumpStripLabel}>{t("hokm.trump")}</span>
              <span className={[styles.trumpStripSuit, isRed ? styles.red : styles.black].join(" ")}>
                {SUIT_SYMBOL[view.trump]}
              </span>
              <span className={[styles.trumpStripName, isRed ? styles.red : styles.black].join(" ")}>
                {t(`hokm.suits.${view.trump}`)}
              </span>
            </div>
          )}

          {isMyTurn && (
            <div className={styles.timerArea}>
              <CountdownRing
                totalSeconds={TURN_SECONDS}
                remainingSeconds={remaining}
                size={48}
              />
            </div>
          )}
        </div>
      </div>

      {/* Move error toast */}
      {moveError && (
        <div
          className={styles.errorToast}
          role="alert"
          onClick={onClearError}
        >
          {moveError}
        </div>
      )}

      {/* Hand fan — sorted, trump cards glow */}
      <HandFan
        cards={sortedHand}
        faceUp
        validCards={isMyTurn ? validCards : undefined}
        trump={view.trump}
        onPlay={isMyTurn ? onPlay : undefined}
        onInvalidPlay={handleInvalidPlay}
        className={styles.fan}
      />
    </div>
  );
}
