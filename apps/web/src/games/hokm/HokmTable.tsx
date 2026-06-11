import type { HokmView } from "@varagh/shared";
import type { Card } from "@varagh/shared";
import type { RoomView } from "@varagh/shared";
import { legalPlays } from "@varagh/shared";
import { OpponentSeat } from "./OpponentSeat";
import { LocalHand } from "./LocalHand";
import { TrickArea } from "./TrickArea";
import { ScorePanel } from "./ScorePanel";
import styles from "./HokmTable.module.css";

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

interface HokmTableProps {
  view: HokmView;
  room: RoomView | null;
  sweepingWinner: string | null;
  trumpRevealSuit: string | null;
  showKotBurst: boolean;
  moveError: string | null;
  onPlay: (card: Card) => void;
  onClearMoveError: () => void;
}

export function HokmTable({
  view,
  room,
  sweepingWinner,
  trumpRevealSuit,
  showKotBurst,
  moveError,
  onPlay,
  onClearMoveError,
}: HokmTableProps) {
  const { players, forPlayer, phase } = view;
  const numPlayers = players.length;
  const localIdx = players.indexOf(forPlayer);
  const seatPositions = getSeatPositions(numPlayers, localIdx);

  const opponents = players.filter((p) => p !== forPlayer);

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
      <ScorePanel view={view} room={room} className={styles.scorePanel} />

      {opponents.map((playerId) => {
        const seatIdx = players.indexOf(playerId);
        const position = seatPositions.get(seatIdx)!;
        const teamColor = getTeamColor(seatIdx, numPlayers);
        const isTurn = view.currentTurn === playerId;
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
            handSize={view.handSizes[seatIdx]}
            trickCount={view.tricksTaken[trickSide]}
            teamColor={teamColor}
            position={position}
            className={styles[`seat_${position.replace("-", "_")}`]}
          />
        );
      })}

      <TrickArea
        view={view}
        seatPositions={seatPositions}
        sweepingWinner={sweepingWinner}
        trumpRevealSuit={trumpRevealSuit}
        className={styles.trickArea}
      />

      <LocalHand
        view={view}
        validCards={validCards}
        moveError={moveError}
        onPlay={onPlay}
        onClearError={onClearMoveError}
        trickCount={view.tricksTaken[
          numPlayers === 4
            ? (localIdx % 2 as 0 | 1)
            : (view.players[view.hakemIndex] === forPlayer ? 0 : 1)
        ]}
        teamColor={getTeamColor(localIdx, numPlayers)}
        isHakem={view.hakemIndex === localIdx}
        className={styles.localHand}
      />
    </div>
  );
}
