import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { HokmView } from "@varagh/shared";
import type { Card } from "@varagh/shared";
import { HandFan } from "../../components/HandFan";
import { PlayerAvatar } from "../../components/PlayerAvatar";
import { TrickPile } from "../../components/TrickPile";
import { CountdownRing } from "../../components/CountdownRing";
import styles from "./LocalHand.module.css";

const TURN_SECONDS = 30;

interface LocalHandProps {
  view: HokmView;
  validCards: Card[];
  moveError: string | null;
  onPlay: (card: Card) => void;
  onClearError: () => void;
  trickCount: number;
  teamColor: "primary" | "tertiary" | "none";
  isHakem: boolean;
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
      setRemaining((s) => Math.max(0, s - 1));
    }, 1000);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isMyTurn]);

  const handleInvalidPlay = (card: Card) => {
    setInvalidCard(card);
    setTimeout(() => setInvalidCard(null), 400);
  };

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
      {/* Player info row */}
      <div className={styles.playerRow}>
        <div className={styles.playerInfo}>
          <PlayerAvatar
            nickname={t("hokm.you")}
            isHakem={isHakem}
            teamColor={teamColor}
            compact
          />
          <TrickPile count={trickCount} teamColor={teamColor} />
        </div>

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

      {/* Hand fan */}
      <HandFan
        cards={view.hand}
        faceUp
        validCards={isMyTurn ? validCards : undefined}
        onPlay={isMyTurn ? onPlay : undefined}
        onInvalidPlay={handleInvalidPlay}
        className={styles.fan}
      />
    </div>
  );
}
