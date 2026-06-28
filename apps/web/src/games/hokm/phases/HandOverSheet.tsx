import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { HokmView, RoomView } from "@varagh/shared";
import type { HandOverEventData } from "../hooks/useAnimatedEvents";
import styles from "./HandOverSheet.module.css";

/** Seconds the hand summary stays up before the next round starts on its own. */
const NEXT_ROUND_SECONDS = 6;

interface HandOverSheetProps {
  data: HandOverEventData;
  view: HokmView;
  room: RoomView | null;
  kotIsHakem: boolean;
  onContinue: () => void;
}

export function HandOverSheet({ data, view, room, kotIsHakem, onContinue }: HandOverSheetProps) {
  const { t } = useTranslation();

  // Auto-advance to the next round after a short countdown — no button needed.
  const [remaining, setRemaining] = useState(NEXT_ROUND_SECONDS);
  useEffect(() => {
    const tick = setInterval(() => setRemaining((s) => Math.max(0, s - 1)), 1000);
    const done = setTimeout(onContinue, NEXT_ROUND_SECONDS * 1000);
    return () => { clearInterval(tick); clearTimeout(done); };
    // Runs once; onContinue only flips overlay state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { tricksTaken, winnerSlot, points, scores } = data;
  const numPlayers = view.players.length;

  const winnerTricks = tricksTaken[winnerSlot] ?? 0;
  const othersTotal = tricksTaken.reduce((sum, t, i) => (i === winnerSlot ? sum : sum + t), 0);
  const isKot = othersTotal === 0;

  const nextHakemId = view.players[view.hakemIndex];
  const nextHakemName =
    room?.seats.find((s) => s.playerId === nextHakemId)?.nickname ??
    nextHakemId.slice(0, 8);

  // Build score labels
  const scoreRows = numPlayers === 4
    ? [
        { label: t("hokm.team", { n: 1 }), score: scores[0] },
        { label: t("hokm.team", { n: 2 }), score: scores[1] },
      ]
    : view.players.map((p, i) => ({
        label: room?.seats.find((s) => s.playerId === p)?.nickname ?? p.slice(0, 8),
        score: scores[i],
      }));

  return (
    <div className={styles.sheet}>
      <div className={styles.content}>
        {/* Kot badge */}
        {isKot && (
          <div className={[styles.kotBadge, kotIsHakem ? styles.hakemKot : null].filter(Boolean).join(" ")}>
            {kotIsHakem ? t("hokm.handOver.hakemKot") : t("hokm.handOver.kot", { score: `${winnerTricks}-${othersTotal}` })}
          </div>
        )}

        {/* Points earned */}
        <div className={styles.pointsBurst}>
          <span className={styles.plusSign}>+</span>
          <span className={styles.pointsNum}>{points}</span>
          <span className={styles.pointsLabel}>
            {t("hokm.handOver.pointsLabel", { count: points })}
          </span>
        </div>

        {/* Trick count row — one entry per slot (2 for teams/heads-up, 3 for free-for-all) */}
        <div className={styles.trickRow}>
          {tricksTaken.map((n, i) => (
            <span key={i} className={styles.trickGroup}>
              {i > 0 && <span className={styles.trickSep}>–</span>}
              <span
                className={[styles.trickNum, i === winnerSlot ? styles.trickWinner : null]
                  .filter(Boolean)
                  .join(" ")}
              >
                {n}
              </span>
            </span>
          ))}
        </div>

        {/* Game scores */}
        <div className={styles.scores}>
          {scoreRows.map((row, i) => (
            <div key={i} className={styles.scoreRow}>
              <span className={styles.scoreName}>{row.label}</span>
              <span className={styles.scoreVal}>{row.score}</span>
            </div>
          ))}
        </div>

        {/* Next hakem */}
        <p className={styles.nextHakem}>
          {t("hokm.handOver.nextHakem", { name: nextHakemName })}
        </p>

        {/* Auto-advance countdown (tap anywhere to skip) */}
        <button
          type="button"
          className={styles.countdown}
          onClick={onContinue}
          aria-label={t("hokm.handOver.skip")}
        >
          <span className={styles.countdownText}>
            {t("hokm.handOver.nextRoundIn", { seconds: remaining })}
          </span>
          <span className={styles.countdownTrack} aria-hidden="true">
            <span
              className={styles.countdownFill}
              style={{ animationDuration: `${NEXT_ROUND_SECONDS}s` }}
            />
          </span>
          <span className={styles.countdownHint}>{t("hokm.handOver.skipHint")}</span>
        </button>
      </div>
    </div>
  );
}
