import { useTranslation } from "react-i18next";
import type { HokmView, RoomView } from "@varagh/shared";
import type { HandOverEventData } from "../hooks/useAnimatedEvents";
import styles from "./HandOverSheet.module.css";

interface HandOverSheetProps {
  data: HandOverEventData;
  view: HokmView;
  room: RoomView | null;
  kotIsHakem: boolean;
  onContinue: () => void;
}

export function HandOverSheet({ data, view, room, kotIsHakem, onContinue }: HandOverSheetProps) {
  const { t } = useTranslation();
  const { tricksTaken, winnerTeam, pointsGained, scores } = data;
  const numPlayers = view.players.length;

  const isKot = tricksTaken[winnerTeam === 0 ? 1 : 0] === 0;

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
            {kotIsHakem ? t("hokm.handOver.hakemKot") : t("hokm.handOver.kot", { score: `${tricksTaken[winnerTeam]}-0` })}
          </div>
        )}

        {/* Points earned */}
        <div className={styles.pointsBurst}>
          <span className={styles.plusSign}>+</span>
          <span className={styles.pointsNum}>{pointsGained}</span>
          <span className={styles.pointsLabel}>
            {t("hokm.handOver.pointsLabel", { count: pointsGained })}
          </span>
        </div>

        {/* Trick count row */}
        <div className={styles.trickRow}>
          <span className={styles.trickNum}>{tricksTaken[0]}</span>
          <span className={styles.trickSep}>–</span>
          <span className={styles.trickNum}>{tricksTaken[1]}</span>
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

        <button
          type="button"
          className={styles.continueBtn}
          onClick={onContinue}
          autoFocus
        >
          {t("hokm.handOver.continue")}
        </button>
      </div>
    </div>
  );
}
