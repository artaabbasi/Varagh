import { useEffect, useRef, useState } from "react";
import { PlayerAvatar } from "../../components/PlayerAvatar";
import { HandFan } from "../../components/HandFan";
import { TrickPile } from "../../components/TrickPile";
import { CountdownRing } from "../../components/CountdownRing";
import type { SeatPosition } from "./HokmTable";
import styles from "./OpponentSeat.module.css";

const TURN_SECONDS = 30;

interface OpponentSeatProps {
  playerId: string;
  nickname: string;
  discriminator: string;
  isHakem: boolean;
  isConnected: boolean;
  isTurn: boolean;
  avatarUrl?: string | null;
  handSize: number;
  trickCount: number;
  teamColor: "primary" | "tertiary" | "none";
  position: SeatPosition;
  className?: string;
}

export function OpponentSeat({
  playerId,
  nickname,
  discriminator,
  isHakem,
  isConnected,
  isTurn,
  avatarUrl,
  handSize,
  trickCount,
  teamColor,
  position,
  className,
}: OpponentSeatProps) {
  const [remaining, setRemaining] = useState(TURN_SECONDS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!isTurn) { setRemaining(TURN_SECONDS); return; }

    setRemaining(TURN_SECONDS);
    intervalRef.current = setInterval(() => {
      setRemaining((s) => Math.max(0, s - 1));
    }, 1000);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isTurn, playerId]);

  return (
    <div
      className={[
        styles.seat,
        styles[`pos_${position.replace("-", "_")}`],
        isTurn ? styles.activeTurn : null,
        teamColor !== "none" ? styles[`team_${teamColor}`] : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-position={position}
    >
      {/* Prominent turn timer badge, centred above the avatar */}
      {isTurn && (
        <div className={styles.timerBadge}>
          <CountdownRing
            totalSeconds={TURN_SECONDS}
            remainingSeconds={remaining}
            size={50}
          />
        </div>
      )}

      <PlayerAvatar
        nickname={nickname}
        discriminator={discriminator}
        isHakem={isHakem}
        isConnected={isConnected}
        teamColor={teamColor}
        avatarUrl={avatarUrl}
        compact
      />

      <HandFan
        cards={Array.from({ length: handSize }, (_, i) => ({ suit: "spades" as const, rank: "2" as const }))}
        faceUp={false}
        compact
        className={styles.handFan}
      />

      <TrickPile
        count={trickCount}
        teamColor={teamColor}
        className={styles.trickPile}
      />
    </div>
  );
}
