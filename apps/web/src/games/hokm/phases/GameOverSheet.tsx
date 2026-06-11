import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { HokmView, RoomView } from "@varagh/shared";
import styles from "./GameOverSheet.module.css";

interface GameOverSheetProps {
  view: HokmView;
  room: RoomView | null;
  onRematch: () => void;
}

export function GameOverSheet({ view, room, onRematch }: GameOverSheetProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const numPlayers = view.players.length;

  const maxScore = Math.max(...view.scores);
  const winnerIndices = view.scores
    .map((s, i) => (s >= maxScore ? i : -1))
    .filter((i) => i >= 0);

  const winnerLabel =
    numPlayers === 4
      ? t("hokm.gameOver.teamWins", {
          name: t(`hokm.team`, { n: winnerIndices[0] % 2 === 0 ? 1 : 2 }),
        })
      : t("hokm.gameOver.winner", {
          name:
            room?.seats.find((s) => s.playerId === view.players[winnerIndices[0]])
              ?.nickname ?? "…",
        });

  const scoreRows =
    numPlayers === 4
      ? [
          { label: t("hokm.team", { n: 1 }), score: view.scores[0] },
          { label: t("hokm.team", { n: 2 }), score: view.scores[1] },
        ]
      : view.players.map((p, i) => ({
          label:
            room?.seats.find((s) => s.playerId === p)?.nickname ?? p.slice(0, 8),
          score: view.scores[i],
          isWinner: winnerIndices.includes(i),
        }));

  return (
    <div className={styles.overlay}>
      <div className={styles.sheet}>
        {/* Trophy */}
        <div className={styles.trophy} aria-hidden="true">
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M24 36c-6 0-10-4-10-10V10h20v16c0 6-4 10-10 10z"
              fill="var(--md-sys-color-tertiary)"
            />
            <path
              d="M10 10H6c0 6 2 10 8 12M38 10h4c0 6-2 10-8 12"
              stroke="var(--md-sys-color-tertiary)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <rect x="18" y="36" width="12" height="4" rx="2" fill="var(--md-sys-color-tertiary)" />
            <rect x="14" y="40" width="20" height="3" rx="1.5" fill="var(--md-sys-color-tertiary)" />
          </svg>
        </div>

        <h2 className={styles.title}>{t("hokm.gameOver.title")}</h2>
        <p className={styles.winnerText}>{winnerLabel}</p>

        {/* Scores */}
        <div className={styles.scores}>
          <p className={styles.scoresTitle}>{t("hokm.gameOver.finalScore")}</p>
          {scoreRows.map((row, i) => (
            <div
              key={i}
              className={[
                styles.scoreRow,
                "isWinner" in row && row.isWinner ? styles.winnerRow : null,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span className={styles.scoreName}>{row.label}</span>
              <span className={styles.scoreVal}>{row.score}</span>
            </div>
          ))}
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={[styles.btn, styles.rematchBtn].join(" ")}
            onClick={onRematch}
            autoFocus
          >
            {t("hokm.gameOver.rematch")}
          </button>
          <button
            type="button"
            className={[styles.btn, styles.leaveBtn].join(" ")}
            onClick={() => navigate("/lobby")}
          >
            {t("hokm.gameOver.leave")}
          </button>
        </div>
      </div>
    </div>
  );
}
