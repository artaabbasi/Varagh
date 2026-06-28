import { useTranslation } from "react-i18next";
import type { HokmView, RoomView, Card } from "@varagh/shared";
import { sortHand } from "@varagh/shared";
import { PlayingCard } from "../../../components/PlayingCard";
import styles from "./DrawPhase.module.css";

interface DrawPhaseProps {
  view: HokmView;
  room: RoomView | null;
  drawFeedback: { playerId: string; action: string } | null;
  /** The card you just took (and optionally burned) on your last draw move. */
  lastDraw: { earned: Card; burned: Card | null; kept: boolean } | null;
  onKeep: () => void;
  onReject: () => void;
}

export function DrawPhase({ view, room, drawFeedback, lastDraw, onKeep, onReject }: DrawPhaseProps) {
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

        {/* Your last draw outcome: the card you earned (feature: shown after a
            blind pass) and — when the room enables it — the card you burned. */}
        {lastDraw && (
          <div className={styles.drawReveal} role="status" aria-live="polite">
            <div className={styles.revealItem}>
              <span className={styles.revealLabel}>
                {lastDraw.kept ? t("hokm.draw.youKept") : t("hokm.draw.youEarned")}
              </span>
              <PlayingCard
                card={lastDraw.earned}
                faceUp
                compact
                isTrump={Boolean(view.trump && lastDraw.earned.suit === view.trump)}
                aria-label={`${lastDraw.earned.rank} of ${lastDraw.earned.suit}`}
              />
            </div>
            {lastDraw.burned && (
              <div className={[styles.revealItem, styles.revealBurned].join(" ")}>
                <span className={styles.revealLabel}>{t("hokm.draw.youBurned")}</span>
                <PlayingCard
                  card={lastDraw.burned}
                  faceUp
                  compact
                  aria-label={`${lastDraw.burned.rank} of ${lastDraw.burned.suit}`}
                />
              </div>
            )}
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

        {/* Cards already collected this drawing phase */}
        {view.hand.length > 0 && (
          <div className={styles.collectedSection}>
            <span className={styles.collectedLabel}>
              {t("hokm.draw.collectedLabel", { count: view.hand.length })}
            </span>
            <div className={styles.collectedRow} aria-label={t("hokm.draw.collectedLabel", { count: view.hand.length })}>
              {sortHand(view.hand, view.trump).map((card, i) => (
                <PlayingCard
                  key={`${card.rank}-${card.suit}`}
                  card={card}
                  faceUp
                  compact
                  isTrump={Boolean(view.trump && card.suit === view.trump)}
                  style={{ marginInlineStart: i === 0 ? 0 : "-18px", zIndex: i }}
                  aria-label={`${card.rank} of ${card.suit}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
