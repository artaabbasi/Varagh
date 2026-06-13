import type { HokmView, TrickPlay } from "@varagh/shared";
import type { SeatPosition } from "./HokmTable";
import { PlayingCard } from "../../components/PlayingCard";
import styles from "./TrickArea.module.css";

function positionToAnimateFrom(pos: SeatPosition) {
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
  trickOverride: TrickPlay[];
  seatPositions: Map<number, SeatPosition>;
  sweepingWinner: string | null;
  reviewingWinner: string | null;
  trumpRevealSuit: string | null;
  className?: string;
}

export function TrickArea({
  view,
  trickOverride,
  seatPositions,
  sweepingWinner,
  reviewingWinner,
  trumpRevealSuit,
  className,
}: TrickAreaProps) {
  const { players } = view;

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
      <div
        className={[
          styles.trickGrid,
          reviewingWinner !== null ? styles.reviewing : null,
        ].filter(Boolean).join(" ")}
        data-num-players={players.length}
      >
        {trickOverride.map((play, i) => {
          const seatIdx = players.indexOf(play.playerId);
          const pos = seatPositions.get(seatIdx) ?? "bottom";
          const animateFrom = positionToAnimateFrom(pos);
          const isSweeping = sweepingWinner !== null;
          const isWinnerCard = play.playerId === reviewingWinner;

          // All cards sweep toward the winner's seat
          const winnerIdx = sweepingWinner ? players.indexOf(sweepingWinner) : -1;
          const winnerPos = winnerIdx >= 0 ? seatPositions.get(winnerIdx) : undefined;

          return (
            <div
              key={`${play.playerId}-${play.card.suit}-${play.card.rank}`}
              className={[
                styles.cardSlot,
                styles[`slot_${pos.replace("-", "_")}`],
                isSweeping ? styles.sweeping : null,
                isWinnerCard ? styles.winnerHighlight : null,
              ]
                .filter(Boolean)
                .join(" ")}
              style={
                {
                  ...(winnerPos ? {
                    "--sweep-x": SWEEP_VECTOR[winnerPos].x,
                    "--sweep-y": SWEEP_VECTOR[winnerPos].y,
                  } : {}),
                  // Stagger: first card flies out first, last card last
                  "--sweep-delay": `${i * 55}ms`,
                } as React.CSSProperties
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
  bottom:     { x: "0px",    y: "240px"  },
  top:        { x: "0px",    y: "-240px" },
  left:       { x: "-240px", y: "0px"    },
  right:      { x: "240px",  y: "0px"    },
  "top-left":  { x: "-170px", y: "-170px" },
  "top-right": { x: "170px",  y: "-170px" },
};
