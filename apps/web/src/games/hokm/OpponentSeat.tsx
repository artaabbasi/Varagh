import { PlayerAvatar } from "../../components/PlayerAvatar";
import { HandFan } from "../../components/HandFan";
import { TrickPile } from "../../components/TrickPile";
import { StickerBubble } from "../../components/stickers/StickerBubble";
import type { SeatPosition } from "./HokmTable";
import styles from "./OpponentSeat.module.css";

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
  /** Active sticker this player just sent: `nonce` changes on each send to replay the pop. */
  sticker?: { id: string; nonce: number } | null;
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
  sticker,
  className,
}: OpponentSeatProps) {
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
      <div className={styles.avatarWrap}>
        {sticker && (
          <StickerBubble key={sticker.nonce} stickerId={sticker.id} placement="below" />
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
      </div>

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
