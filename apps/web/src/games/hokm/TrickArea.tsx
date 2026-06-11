import { useEffect, useRef, useState } from "react";
import type { HokmView, TrickPlay } from "@varagh/shared";
import type { SeatPosition } from "./HokmTable";
import { PlayingCard } from "../../components/PlayingCard";
import styles from "./TrickArea.module.css";

const SWEEP_DELAY_MS = 800;

function positionToAnimateFrom(pos: SeatPosition) {
  // The card flies in FROM the seat's position — i.e., if the seat is at "top",
  // the card animates in from above.
  const map: Record<SeatPosition, "bottom" | "top" | "left" | "right"> = {
    bottom: "bottom",
    top: "top",
    left: "left",
    right: "right",
    "top-left": "top",
    "top-right": "top",
  };
  return map[pos];
}

interface TrickAreaProps {
  view: HokmView;
  seatPositions: Map<number, SeatPosition>;
  sweepingWinner: string | null;
  trumpRevealSuit: string | null;
  className?: string;
}

export function TrickArea({
  view,
  seatPositions,
  sweepingWinner,
  trumpRevealSuit,
  className,
}: TrickAreaProps) {
  const { players, currentTrick } = view;

  // Buffer trick for sweep animation: keep showing old trick during sweep
  const [displayTrick, setDisplayTrick] = useState<TrickPlay[]>([]);
  const prevLengthRef = useRef(0);
  const sweepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSweepingRef = useRef(false);

  useEffect(() => {
    const prev = prevLengthRef.current;
    const curr = currentTrick.length;

    if (curr === 0 && prev >= players.length && !isSweepingRef.current) {
      // Trick was just completed — hold the display, let CSS animate sweep
      isSweepingRef.current = true;
      sweepTimerRef.current = setTimeout(() => {
        setDisplayTrick([]);
        isSweepingRef.current = false;
      }, SWEEP_DELAY_MS);
    } else if (!isSweepingRef.current) {
      setDisplayTrick(currentTrick);
    }

    prevLengthRef.current = curr;

    return () => {
      if (sweepTimerRef.current) clearTimeout(sweepTimerRef.current);
    };
  }, [currentTrick, players.length]);

  return (
    <div className={[styles.area, className].filter(Boolean).join(" ")}>
      {/* Trump suit indicator in center */}
      {view.trump && (
        <div className={styles.trumpIndicator}>
          <span
            className={[
              styles.trumpSymbol,
              view.trump === "hearts" || view.trump === "diamonds"
                ? styles.red
                : styles.black,
            ].join(" ")}
          >
            {SUIT_SYMBOL[view.trump]}
          </span>
        </div>
      )}

      {/* Played cards */}
      <div className={styles.trickGrid} data-num-players={players.length}>
        {displayTrick.map((play, i) => {
          const seatIdx = players.indexOf(play.playerId);
          const pos = seatPositions.get(seatIdx) ?? "bottom";
          const animateFrom = positionToAnimateFrom(pos);
          const isSweeping = sweepingWinner !== null;

          // Sweep direction — card flies toward winner's seat
          const winnerIdx = sweepingWinner ? players.indexOf(sweepingWinner) : -1;
          const winnerPos = winnerIdx >= 0 ? seatPositions.get(winnerIdx) : undefined;

          return (
            <div
              key={`${play.playerId}-${play.card.suit}-${play.card.rank}`}
              className={[
                styles.cardSlot,
                styles[`slot_${pos.replace("-", "_")}`],
                isSweeping ? styles.sweeping : null,
              ]
                .filter(Boolean)
                .join(" ")}
              style={
                winnerPos
                  ? ({
                      "--sweep-x": SWEEP_VECTOR[winnerPos].x,
                      "--sweep-y": SWEEP_VECTOR[winnerPos].y,
                    } as React.CSSProperties)
                  : undefined
              }
            >
              <PlayingCard
                card={play.card}
                faceUp
                animateFrom={animateFrom}
                aria-label={`${play.card.rank} of ${play.card.suit}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

const SUIT_SYMBOL: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

const SWEEP_VECTOR: Record<SeatPosition, { x: string; y: string }> = {
  bottom: { x: "0px", y: "120px" },
  top: { x: "0px", y: "-120px" },
  left: { x: "-120px", y: "0px" },
  right: { x: "120px", y: "0px" },
  "top-left": { x: "-80px", y: "-80px" },
  "top-right": { x: "80px", y: "-80px" },
};
