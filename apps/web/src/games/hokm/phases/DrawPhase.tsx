import { useTranslation } from "react-i18next";
import type { HokmView, RoomView } from "@varagh/shared";
import { PlayingCard } from "../../../components/PlayingCard";
import styles from "./DrawPhase.module.css";

interface DrawPhaseProps {
  view: HokmView;
  room: RoomView | null;
  drawFeedback: { playerId: string; action: string } | null;
  onKeep: () => void;
  onReject: () => void;
}

export function DrawPhase({ view, room, drawFeedback, onKeep, onReject }: DrawPhaseProps) {
  const { t } = useTranslation();
  const isMyTurn = view.currentTurn === view.forPlayer;

  const opponentId = view.players.find((p) => p !== view.forPlayer);
  const opponentNickname =
    room?.seats.find((s) => s.playerId === opponentId)?.nickname ??
    opponentId?.slice(0, 8) ??
    "…";

  return (
    <div className={styles.sheet}>
      <div className={styles.content}>
        <h2 className={styles.title}>{t("hokm.draw.title")}</h2>

        <div className={styles.stockInfo}>
          <span className={styles.stockCount}>
            {t("hokm.draw.stockRemaining", { count: view.stockCount })}
          </span>
        </div>

        {/* Opponent draw feedback */}
        {drawFeedback && drawFeedback.playerId !== view.forPlayer && (
          <div className={styles.opponentFeedback} role="status" aria-live="polite">
            {drawFeedback.action === "kept"
              ? t("hokm.draw.opponentKept", { name: opponentNickname })
              : t("hokm.draw.opponentPassed", { name: opponentNickname })}
          </div>
        )}

        {/* Card display */}
        <div className={styles.cardArea}>
          {isMyTurn && view.seenCard ? (
            <>
              <PlayingCard
                card={view.seenCard}
                faceUp
                aria-label={`${view.seenCard.rank} of ${view.seenCard.suit}`}
                className={styles.seenCard}
              />
              <p className={styles.cardHint}>{t("hokm.draw.cardHint")}</p>
            </>
          ) : (
            <div className={styles.waitingCard}>
              <PlayingCard faceUp={false} />
              <p className={styles.waitingText}>
                {t("hokm.draw.waitingForOpponent", { name: opponentNickname })}
              </p>
            </div>
          )}
        </div>

        {/* Keep / Pass buttons */}
        {isMyTurn && view.seenCard && (
          <div className={styles.actions}>
            <button
              type="button"
              className={[styles.btn, styles.keepBtn].join(" ")}
              onClick={onKeep}
            >
              {t("hokm.draw.keep")}
            </button>
            <button
              type="button"
              className={[styles.btn, styles.passBtn].join(" ")}
              onClick={onReject}
            >
              {t("hokm.draw.pass")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
