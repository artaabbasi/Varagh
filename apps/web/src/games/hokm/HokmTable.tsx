import { useEffect, useRef, useState } from "react";
import type { HokmView, TrickPlay } from "@varagh/shared";
import type { Card } from "@varagh/shared";
import type { RoomView } from "@varagh/shared";
import { legalPlays } from "@varagh/shared";
import { OpponentSeat } from "./OpponentSeat";
import { LocalHand } from "./LocalHand";
import { TrickArea } from "./TrickArea";
import { ScorePanel } from "./ScorePanel";
import { POINT_DELAY_MS } from "./timing";
import styles from "./HokmTable.module.css";

/**
 * The raw view increments tricksTaken the instant a trick completes, but we
 * want the point to land only once the cards have swept to the winner. This
 * holds the previous counts for POINT_DELAY_MS after they rise, so the trick
 * piles and score panel tick up in time with the sweep animation.
 */
function useDelayedTricks(tricksTaken: [number, number]): [number, number] {
  const [shown, setShown] = useState<[number, number]>(tricksTaken);
  const prevRef = useRef<[number, number]>(tricksTaken);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    const rose = tricksTaken[0] > prev[0] || tricksTaken[1] > prev[1];
    if (rose) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        prevRef.current = tricksTaken;
        setShown(tricksTaken);
      }, POINT_DELAY_MS);
    } else {
      // Reset (new hand) or unchanged — reveal immediately.
      prevRef.current = tricksTaken;
      setShown(tricksTaken);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [tricksTaken[0], tricksTaken[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  return shown;
}

export type SeatPosition = "bottom" | "top" | "left" | "right" | "top-left" | "top-right";

function getSeatPositions(
  numPlayers: number,
  localIdx: number,
): Map<number, SeatPosition> {
  const map = new Map<number, SeatPosition>();
  if (numPlayers === 4) {
    map.set(localIdx, "bottom");
    map.set((localIdx + 1) % 4, "left");
    map.set((localIdx + 2) % 4, "top");
    map.set((localIdx + 3) % 4, "right");
  } else if (numPlayers === 3) {
    map.set(localIdx, "bottom");
    map.set((localIdx + 1) % 3, "top-left");
    map.set((localIdx + 2) % 3, "top-right");
  } else {
    map.set(localIdx, "bottom");
    map.set((localIdx + 1) % 2, "top");
  }
  return map;
}

function getTeamColor(
  seatIdx: number,
  numPlayers: number,
): "primary" | "tertiary" | "none" {
  if (numPlayers !== 4) return "none";
  return seatIdx % 2 === 0 ? "primary" : "tertiary";
}

function getNickname(room: RoomView | null, playerId: string): string {
  const seat = room?.seats.find((s) => s.playerId === playerId);
  return seat?.nickname ?? playerId.slice(0, 8);
}

function getDiscriminator(room: RoomView | null, playerId: string): string {
  const seat = room?.seats.find((s) => s.playerId === playerId);
  return seat?.discriminator ?? "";
}

function isConnected(room: RoomView | null, playerId: string): boolean {
  const seat = room?.seats.find((s) => s.playerId === playerId);
  return seat?.connected ?? true;
}

function getAvatar(room: RoomView | null, playerId: string): string | null {
  return room?.seats.find((s) => s.playerId === playerId)?.avatar ?? null;
}

interface HokmTableProps {
  view: HokmView;
  room: RoomView | null;
  trickOverride: TrickPlay[];
  sweepingWinner: string | null;
  reviewingWinner: string | null;
  trumpRevealSuit: string | null;
  showKotBurst: boolean;
  moveError: string | null;
  onPlay: (card: Card) => void;
  onClearMoveError: () => void;
  onLeave?: () => void;
}

export function HokmTable({
  view,
  room,
  trickOverride,
  sweepingWinner,
  reviewingWinner,
  trumpRevealSuit,
  showKotBurst,
  moveError,
  onPlay,
  onClearMoveError,
  onLeave,
}: HokmTableProps) {
  const { players, forPlayer, phase } = view;
  const numPlayers = players.length;
  const localIdx = players.indexOf(forPlayer);
  const seatPositions = getSeatPositions(numPlayers, localIdx);

  const opponents = players.filter((p) => p !== forPlayer);

  // Trick counts that lag the raw view so the "point" lands with the sweep.
  const shownTricks = useDelayedTricks(view.tricksTaken);

  const isPlaying = phase === "playing";
  const isMyTurn = view.currentTurn === forPlayer;
  const validCards =
    isPlaying && isMyTurn ? legalPlays(view.hand, view.currentTrick) : [];

  const tableClass = [
    styles.table,
    numPlayers === 4 ? styles.table4p : null,
    numPlayers === 3 ? styles.table3p : null,
    numPlayers === 2 ? styles.table2p : null,
    showKotBurst ? styles.kotBurst : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={tableClass}>
      {/* Decorative card-table felt + centre emblem (behind all seats) */}
      <div className={styles.felt} aria-hidden="true">
        <div className={styles.feltEmblem}>
          <span className={styles.feltSuit} data-suit="spades">♠</span>
          <span className={styles.feltSuit} data-suit="hearts">♥</span>
          <span className={styles.feltSuit} data-suit="diamonds">♦</span>
          <span className={styles.feltSuit} data-suit="clubs">♣</span>
        </div>
      </div>

      <ScorePanel view={view} room={room} tricksOverride={shownTricks} onLeave={onLeave} className={styles.scorePanel} />

      {opponents.map((playerId) => {
        const seatIdx = players.indexOf(playerId);
        const position = seatPositions.get(seatIdx)!;
        const teamColor = getTeamColor(seatIdx, numPlayers);
        const isTurn = phase === "playing" && view.currentTurn === playerId;
        const trickSide = numPlayers === 4
          ? (seatIdx % 2 as 0 | 1)
          : (view.players[view.hakemIndex] === playerId ? 0 : 1);

        return (
          <OpponentSeat
            key={playerId}
            playerId={playerId}
            nickname={getNickname(room, playerId)}
            discriminator={getDiscriminator(room, playerId)}
            isHakem={view.hakemIndex === seatIdx}
            isConnected={isConnected(room, playerId)}
            isTurn={isTurn}
            avatarUrl={getAvatar(room, playerId)}
            handSize={view.handSizes[seatIdx]}
            trickCount={shownTricks[trickSide]}
            teamColor={teamColor}
            position={position}
            className={styles[`seat_${position.replace("-", "_")}`]}
          />
        );
      })}

      <TrickArea
        view={view}
        trickOverride={trickOverride}
        seatPositions={seatPositions}
        sweepingWinner={sweepingWinner}
        reviewingWinner={reviewingWinner}
        trumpRevealSuit={trumpRevealSuit}
        className={styles.trickArea}
      />

      <LocalHand
        view={view}
        validCards={validCards}
        moveError={moveError}
        onPlay={onPlay}
        onClearError={onClearMoveError}
        trickCount={shownTricks[
          numPlayers === 4
            ? (localIdx % 2 as 0 | 1)
            : (view.players[view.hakemIndex] === forPlayer ? 0 : 1)
        ]}
        teamColor={getTeamColor(localIdx, numPlayers)}
        isHakem={view.hakemIndex === localIdx}
        avatarUrl={getAvatar(room, forPlayer)}
        className={styles.localHand}
      />
    </div>
  );
}
