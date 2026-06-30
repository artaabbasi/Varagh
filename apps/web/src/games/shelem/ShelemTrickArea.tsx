import type { Card, Suit, TrickPlay } from "@varagh/shared";
import { PlayingCard } from "../../components/PlayingCard";
import styles from "./ShelemTrickArea.module.css";

/** Seat positions for 4-player Shelem (local player always at the bottom). */
export type Pos = "bottom" | "top" | "left" | "right";

const SUIT_SYMBOL: Record<string, string> = { hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠" };

/** Each seat's card flies out toward that seat when the trick sweeps. */
const SWEEP_VECTOR: Record<Pos, { x: string; y: string }> = {
  bottom: { x: "0px", y: "240px" },
  top:    { x: "0px", y: "-240px" },
  left:   { x: "-240px", y: "0px" },
  right:  { x: "240px", y: "0px" },
};

interface ShelemTrickAreaProps {
  trick: TrickPlay[];
  players: string[];
  seatPositions: Map<number, Pos>;
  trumpSuit: Suit | null;
  reviewingWinner: string | null;
  sweepingWinner: string | null;
  className?: string;
}

/**
 * Played cards land in front of the seat that played them (physical slots so
 * each card sits in front of its player in both LTR and RTL), then — when the
 * trick completes — pop the winner and sweep every card to the winner's seat.
 * Cloned from Hokm's TrickArea (4-player layout only).
 */
export function ShelemTrickArea({
  trick,
  players,
  seatPositions,
  trumpSuit,
  reviewingWinner,
  sweepingWinner,
  className,
}: ShelemTrickAreaProps) {
  return (
    <div className={[styles.area, className].filter(Boolean).join(" ")}>
      {trumpSuit && (
        <div className={styles.trumpIndicator}>
          <span className={[styles.trumpSymbol, trumpSuit === "hearts" || trumpSuit === "diamonds" ? styles.red : styles.black].join(" ")}>
            {SUIT_SYMBOL[trumpSuit]}
          </span>
        </div>
      )}

      <div className={[styles.trickGrid, reviewingWinner !== null ? styles.reviewing : null].filter(Boolean).join(" ")}>
        {trick.map((play: TrickPlay, i: number) => {
          const seatIdx = players.indexOf(play.playerId);
          const pos = seatPositions.get(seatIdx) ?? "bottom";
          const isSweeping = sweepingWinner !== null;
          const isWinnerCard = play.playerId === reviewingWinner;
          const winnerIdx = sweepingWinner ? players.indexOf(sweepingWinner) : -1;
          const winnerPos = winnerIdx >= 0 ? seatPositions.get(winnerIdx) : undefined;
          const card: Card = play.card;

          return (
            <div
              key={`${play.playerId}-${card.suit}-${card.rank}`}
              className={[
                styles.cardSlot,
                styles[`slot_${pos}`],
                isSweeping ? styles.sweeping : null,
                isWinnerCard ? styles.winnerHighlight : null,
              ].filter(Boolean).join(" ")}
              style={{
                ...(winnerPos ? { "--sweep-x": SWEEP_VECTOR[winnerPos].x, "--sweep-y": SWEEP_VECTOR[winnerPos].y } : {}),
                "--sweep-delay": `${i * 55}ms`,
              } as React.CSSProperties}
            >
              <PlayingCard card={card} faceUp animateFrom={pos} aria-label={`${card.rank} of ${card.suit}`} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
